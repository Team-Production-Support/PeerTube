import express from 'express'
import { move } from 'fs-extra'
import { basename } from 'path'
import { getResumableUploadPath } from '@server/helpers/upload'
import { getLocalVideoActivityPubUrl } from '@server/lib/activitypub/url'
import { JobQueue } from '@server/lib/job-queue'
import { generateWebTorrentVideoFilename } from '@server/lib/paths'
import { Redis } from '@server/lib/redis'
import { uploadx } from '@server/lib/uploadx'
import {
  addMoveToObjectStorageJob,
  addOptimizeOrMergeAudioJob,
  buildLocalVideoFromReq,
  buildVideoThumbnailsFromReq,
  setVideoTags
} from '@server/lib/video'
import { VideoPathManager } from '@server/lib/video-path-manager'
import { buildNextVideoState } from '@server/lib/video-state'
import { openapiOperationDoc } from '@server/middlewares/doc'
import { MVideoFile, MVideoFullLight } from '@server/types/models'
import { getLowercaseExtension } from '@shared/core-utils'
import { isAudioFile, uuidToShort } from '@shared/extra-utils'
import { HttpStatusCode, ManageVideoTorrentPayload, VideoCreate, VideoResolution, VideoState } from '@shared/models'
import { auditLoggerFactory, getAuditIdFromRes, VideoAuditView } from '../../../helpers/audit-logger'
import { retryTransactionWrapper } from '../../../helpers/database-utils'
import { createReqFiles } from '../../../helpers/express-utils'
import { buildFileMetadata, ffprobePromise, getVideoStreamDimensionsInfo, getVideoStreamFPS } from '../../../helpers/ffmpeg'
import { logger, loggerTagsFactory } from '../../../helpers/logger'
import { MIMETYPES } from '../../../initializers/constants'
import { sequelizeTypescript } from '../../../initializers/database'
import { federateVideoIfNeeded } from '../../../lib/activitypub/videos'
import { Notifier } from '../../../lib/notifier'
import { Hooks } from '../../../lib/plugins/hooks'
import { generateVideoMiniature } from '../../../lib/thumbnail'
import { autoBlacklistVideoIfNeeded } from '../../../lib/video-blacklist'
import {
  asyncMiddleware,
  asyncRetryTransactionMiddleware,
  authenticate,
  videosAddLegacyValidator,
  videosAddResumableInitValidator,
  videosAddResumableValidator
} from '../../../middlewares'
import { ScheduleVideoUpdateModel } from '../../../models/video/schedule-video-update'
import { VideoModel } from '../../../models/video/video'
import { VideoFileModel } from '../../../models/video/video-file'

const lTags = loggerTagsFactory('api', 'video')
const auditLogger = auditLoggerFactory('videos')
const uploadRouter = express.Router()

const reqVideoFileAdd = createReqFiles(
  [ 'videofile', 'thumbnailfile', 'previewfile' ],
  { ...MIMETYPES.VIDEO.MIMETYPE_EXT, ...MIMETYPES.IMAGE.MIMETYPE_EXT }
)

const reqVideoFileAddResumable = createReqFiles(
  [ 'thumbnailfile', 'previewfile' ],
  MIMETYPES.IMAGE.MIMETYPE_EXT,
  getResumableUploadPath()
)

uploadRouter.post('/upload',
  openapiOperationDoc({ operationId: 'uploadLegacy' }),
  authenticate,
  reqVideoFileAdd,
  asyncMiddleware(videosAddLegacyValidator),
  asyncRetryTransactionMiddleware(addVideoLegacy)
)

uploadRouter.post('/upload-resumable',
  openapiOperationDoc({ operationId: 'uploadResumableInit' }),
  authenticate,
  reqVideoFileAddResumable,
  asyncMiddleware(videosAddResumableInitValidator),
  uploadx.upload
)

uploadRouter.delete('/upload-resumable',
  authenticate,
  asyncMiddleware(deleteUploadResumableCache),
  uploadx.upload
)

uploadRouter.put('/upload-resumable',
  openapiOperationDoc({ operationId: 'uploadResumable' }),
  authenticate,
  uploadx.upload, // uploadx doesn't next() before the file upload completes
  asyncMiddleware(videosAddResumableValidator),
  asyncMiddleware(addVideoResumable)
)

// ---------------------------------------------------------------------------

export {
  uploadRouter
}

// ---------------------------------------------------------------------------

async function addVideoLegacy (req: express.Request, res: express.Response) {
  // Uploading the video could be long
  // Set timeout to 10 minutes, as Express's default is 2 minutes
  req.setTimeout(1000 * 60 * 10, () => {
    logger.error('Video upload has timed out.')
    return res.fail({
      status: HttpStatusCode.REQUEST_TIMEOUT_408,
      message: 'Video upload has timed out.'
    })
  })

  const videoPhysicalFile = req.files['videofile'][0]
  const videoInfo: VideoCreate = req.body
  const files = req.files

  const response = await addVideo({ req, res, videoPhysicalFile, videoInfo, files })

  return res.json(response)
}

async function addVideoResumable (req: express.Request, res: express.Response) {
  const videoPhysicalFile = res.locals.videoFileResumable
  const videoInfo = videoPhysicalFile.metadata
  const files = { previewfile: videoInfo.previewfile }

  const response = await addVideo({ req, res, videoPhysicalFile, videoInfo, files })
  await Redis.Instance.setUploadSession(req.query.upload_id, response)

  return res.json(response)
}

async function addVideo (options: {
  req: express.Request
  res: express.Response
  videoPhysicalFile: express.VideoUploadFile
  videoInfo: VideoCreate
  files: express.UploadFiles
}) {
  const { req, res, videoPhysicalFile, videoInfo, files } = options
  const videoChannel = res.locals.videoChannel
  const user = res.locals.oauth.token.User

  let videoData = buildLocalVideoFromReq(videoInfo, videoChannel.id)
  videoData = await Hooks.wrapObject(videoData, 'filter:api.video.upload.video-attribute.result')

  videoData.state = buildNextVideoState()
  videoData.duration = videoPhysicalFile.duration // duration was added by a previous middleware

  const video = new VideoModel(videoData) as MVideoFullLight
  video.VideoChannel = videoChannel
  video.url = getLocalVideoActivityPubUrl(video) // We use the UUID, so set the URL after building the object

  const videoFile = await buildNewFile(videoPhysicalFile)

  // Move physical file
  const destination = VideoPathManager.Instance.getFSVideoFileOutputPath(video, videoFile)
  await move(videoPhysicalFile.path, destination)
  // This is important in case if there is another attempt in the retry process
  videoPhysicalFile.filename = basename(destination)
  videoPhysicalFile.path = destination

  const [ thumbnailModel, previewModel ] = await buildVideoThumbnailsFromReq({
    video,
    files,
    fallback: type => generateVideoMiniature({ video, videoFile, type })
  })

  const { videoCreated } = await sequelizeTypescript.transaction(async t => {
    const sequelizeOptions = { transaction: t }

    const videoCreated = await video.save(sequelizeOptions) as MVideoFullLight

    await videoCreated.addAndSaveThumbnail(thumbnailModel, t)
    await videoCreated.addAndSaveThumbnail(previewModel, t)

    // Do not forget to add video channel information to the created video
    videoCreated.VideoChannel = res.locals.videoChannel

    videoFile.videoId = video.id
    await videoFile.save(sequelizeOptions)

    video.VideoFiles = [ videoFile ]

    await setVideoTags({ video, tags: videoInfo.tags, transaction: t })

    // Schedule an update in the future?
    if (videoInfo.scheduleUpdate) {
      await ScheduleVideoUpdateModel.create({
        videoId: video.id,
        updateAt: new Date(videoInfo.scheduleUpdate.updateAt),
        privacy: videoInfo.scheduleUpdate.privacy || null
      }, sequelizeOptions)
    }

    await autoBlacklistVideoIfNeeded({
      video,
      user,
      isRemote: false,
      isNew: true,
      transaction: t
    })

    auditLogger.create(getAuditIdFromRes(res), new VideoAuditView(videoCreated.toFormattedDetailsJSON()))
    logger.info('Video with name %s and uuid %s created.', videoInfo.name, videoCreated.uuid, lTags(videoCreated.uuid))

    return { videoCreated }
  })

  // Channel has a new content, set as updated
  await videoCreated.VideoChannel.setAsUpdated()

  createTorrentFederate(videoCreated, videoFile)
    .catch(err => {
      logger.error('Cannot create torrent or federate video for %s.', videoCreated.uuid, { err, ...lTags(videoCreated.uuid) })

      return videoCreated
    }).then(refreshedVideo => {
      if (!refreshedVideo) return

      if (refreshedVideo.state === VideoState.TO_MOVE_TO_EXTERNAL_STORAGE) {
        return addMoveToObjectStorageJob({ video: refreshedVideo, previousVideoState: undefined })
      }

      if (refreshedVideo.state === VideoState.TO_TRANSCODE) {
        return addOptimizeOrMergeAudioJob({ video: refreshedVideo, videoFile, user })
      }
    }).catch(err => logger.error('Cannot add optimize/merge audio job for %s.', videoCreated.uuid, { err, ...lTags(videoCreated.uuid) }))

  Hooks.runAction('action:api.video.uploaded', { video: videoCreated, req, res })

  return {
    video: {
      id: videoCreated.id,
      shortUUID: uuidToShort(videoCreated.uuid),
      uuid: videoCreated.uuid
    }
  }
}

async function buildNewFile (videoPhysicalFile: express.VideoUploadFile) {
  const videoFile = new VideoFileModel({
    extname: getLowercaseExtension(videoPhysicalFile.filename),
    size: videoPhysicalFile.size,
    videoStreamingPlaylistId: null,
    metadata: await buildFileMetadata(videoPhysicalFile.path)
  })

  const probe = await ffprobePromise(videoPhysicalFile.path)

  if (await isAudioFile(videoPhysicalFile.path, probe)) {
    videoFile.resolution = VideoResolution.H_NOVIDEO
  } else {
    videoFile.fps = await getVideoStreamFPS(videoPhysicalFile.path, probe)
    videoFile.resolution = (await getVideoStreamDimensionsInfo(videoPhysicalFile.path, probe)).resolution
  }

  videoFile.filename = generateWebTorrentVideoFilename(videoFile.resolution, videoFile.extname)

  return videoFile
}

async function createTorrentFederate (video: MVideoFullLight, videoFile: MVideoFile) {
  const payload: ManageVideoTorrentPayload = { videoId: video.id, videoFileId: videoFile.id, action: 'create' }

  const job = await JobQueue.Instance.createJobWithPromise({ type: 'manage-video-torrent', payload })
  await job.finished()

  const refreshedVideo = await VideoModel.loadAndPopulateAccountAndServerAndTags(video.id)
  if (!refreshedVideo) return

  // Only federate and notify after the torrent creation
  Notifier.Instance.notifyOnNewVideoIfNeeded(refreshedVideo)

  await retryTransactionWrapper(() => {
    return sequelizeTypescript.transaction(t => federateVideoIfNeeded(refreshedVideo, true, t))
  })

  return refreshedVideo
}

async function deleteUploadResumableCache (req: express.Request, res: express.Response, next: express.NextFunction) {
  await Redis.Instance.deleteUploadSession(req.query.upload_id)

  return next()
}
