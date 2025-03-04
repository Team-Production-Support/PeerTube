import { ContextType } from '@shared/models'

function activityPubContextify <T> (data: T, type: ContextType) {
  return { ...getContextData(type), ...data }
}

// ---------------------------------------------------------------------------

export {
  getContextData,
  activityPubContextify
}

// ---------------------------------------------------------------------------

type ContextValue = { [ id: string ]: (string | { '@type': string, '@id': string }) }

const contextStore = {
  Video: buildContext({
    Hashtag: 'as:Hashtag',
    uuid: 'sc:identifier',
    category: 'sc:category',
    licence: 'sc:license',
    subtitleLanguage: 'sc:subtitleLanguage',
    sensitive: 'as:sensitive',
    language: 'sc:inLanguage',

    // TODO: remove in a few versions, introduced in 4.2
    icons: 'as:icon',

    isLiveBroadcast: 'sc:isLiveBroadcast',
    liveSaveReplay: {
      '@type': 'sc:Boolean',
      '@id': 'pt:liveSaveReplay'
    },
    permanentLive: {
      '@type': 'sc:Boolean',
      '@id': 'pt:permanentLive'
    },
    latencyMode: {
      '@type': 'sc:Number',
      '@id': 'pt:latencyMode'
    },

    Infohash: 'pt:Infohash',

    originallyPublishedAt: 'sc:datePublished',
    views: {
      '@type': 'sc:Number',
      '@id': 'pt:views'
    },
    state: {
      '@type': 'sc:Number',
      '@id': 'pt:state'
    },
    size: {
      '@type': 'sc:Number',
      '@id': 'pt:size'
    },
    fps: {
      '@type': 'sc:Number',
      '@id': 'pt:fps'
    },
    commentsEnabled: {
      '@type': 'sc:Boolean',
      '@id': 'pt:commentsEnabled'
    },
    downloadEnabled: {
      '@type': 'sc:Boolean',
      '@id': 'pt:downloadEnabled'
    },
    waitTranscoding: {
      '@type': 'sc:Boolean',
      '@id': 'pt:waitTranscoding'
    },
    support: {
      '@type': 'sc:Text',
      '@id': 'pt:support'
    },
    likes: {
      '@id': 'as:likes',
      '@type': '@id'
    },
    dislikes: {
      '@id': 'as:dislikes',
      '@type': '@id'
    },
    shares: {
      '@id': 'as:shares',
      '@type': '@id'
    },
    comments: {
      '@id': 'as:comments',
      '@type': '@id'
    }
  }),

  Playlist: buildContext({
    Playlist: 'pt:Playlist',
    PlaylistElement: 'pt:PlaylistElement',
    position: {
      '@type': 'sc:Number',
      '@id': 'pt:position'
    },
    startTimestamp: {
      '@type': 'sc:Number',
      '@id': 'pt:startTimestamp'
    },
    stopTimestamp: {
      '@type': 'sc:Number',
      '@id': 'pt:stopTimestamp'
    }
  }),

  CacheFile: buildContext({
    expires: 'sc:expires',
    CacheFile: 'pt:CacheFile'
  }),

  Flag: buildContext({
    Hashtag: 'as:Hashtag'
  }),

  Actor: buildContext({
    playlists: {
      '@id': 'pt:playlists',
      '@type': '@id'
    }
  }),

  Follow: buildContext(),
  Reject: buildContext(),
  Accept: buildContext(),
  View: buildContext(),
  Announce: buildContext(),
  Comment: buildContext(),
  Delete: buildContext(),
  Rate: buildContext()
}

function getContextData (type: ContextType) {
  return {
    '@context': contextStore[type]
  }
}

function buildContext (contextValue?: ContextValue) {
  const baseContext = [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1',
    {
      RsaSignature2017: 'https://w3id.org/security#RsaSignature2017'
    }
  ]

  if (!contextValue) return baseContext

  return [
    ...baseContext,

    {
      pt: 'https://joinpeertube.org/ns#',
      sc: 'http://schema.org#',

      ...contextValue
    }
  ]
}
