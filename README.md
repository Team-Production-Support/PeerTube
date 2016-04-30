# PeerTube

*Server*
[![Build Status](https://travis-ci.org/Chocobozzz/PeerTube.svg?branch=master)](https://travis-ci.org/Chocobozzz/PeerTube)
[![Dependencies Status](https://david-dm.org/Chocobozzz/PeerTube.svg)](https://david-dm.org/Chocobozzz/PeerTube)
[![devDependency Status](https://david-dm.org/Chocobozzz/PeerTube/dev-status.svg)](https://david-dm.org/Chocobozzz/PeerTube#info=devDependencies)
[![Code climate](https://codeclimate.com/github/Chocobozzz/PeerTube/badges/gpa.svg)](https://codeclimate.com/github/Chocobozzz/PeerTube)

*Client*
[![Dependency Status](https://david-dm.org/Chocobozzz/PeerTube.svg?path=client)](https://david-dm.org/Chocobozzz/PeerTube?path=client)
[![devDependency Status](https://david-dm.org/Chocobozzz/PeerTube/dev-status.svg?path=client)](https://david-dm.org/Chocobozzz/PeerTube?path=client#info=devDependencies)

Prototype of a decentralized video streaming platform using P2P (bittorrent) directly in the web browser with [webtorrent](https://github.com/feross/webtorrent).

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

## Why

We can't build a FOSS video streaming alternatives to YouTube, Dailymotion, Vimeo... with a centralized software. One organization alone cannot have enought money to pay bandwith and video storage of its server.

So we need to have a decentralized network (as [Diaspora](https://github.com/diaspora/diaspora) for example).
But it's not enought because one video could become famous and overload the server.
It's the reason why we need to use a P2P protocol to limit the server load.
Thanks to [webtorrent](https://github.com/feross/webtorrent), we can make P2P (thus bittorrent) inside the web browser right now.

## Features

- [X] Frontend
  - [X] ~~Simple frontend (All elements are generated by jQuery)~~
  - [X] Angular 2 frontend
- [X] Join a network
  - [X] Generate a RSA key
  - [X] Ask for the friend list of other pods and make friend with them
  - [X] Get the list of the videos owned by a pod when making friend with it
  - [X] Post the list of its own videos when making friend with another pod
- [X] Quit a network
- [X] Upload a video
  - [X] Seed the video
  - [X] Send the meta data to all other friends
- [X] Remove the video
- [X] List the videos
- [X] Search a video name (local index)
- [X] View the video in an HTML5 page with webtorrent
- [ ]  Manage user accounts
  - [ ] Inscription
  - [X] Connection
  - [X] Account rights (upload...)
- [X] Make the network auto sufficient (eject bad pods etc)
- [ ] Manage API breaks
- [ ] Add "DDOS" security (check if a pod don't send too many requests for example)


## Usage

### Front compatibility

  * Chromium
  * Firefox (>= 42 for MediaSource support)

### Dependencies

  * **NodeJS >= 4.2**
  * OpenSSL (cli)
  * MongoDB
  * xvfb-run libgtk2.0-0 libgconf-2-4 libnss3 libasound2 libxtst6 libxss1 libnotify-bin (for electron)

#### Debian

Install NodeJS 4.2: [https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions)

    # apt-get install mongodb openssl xvfb curl sudo git build-essential libgtk2.0-0 libgconf-2-4 libnss3 libasound2 libxtst6 libxss1 libnotify-bin
    # npm install -g electron-prebuilt


### Test It!

    $ git clone https://github.com/Chocobozzz/PeerTube
    $ cd PeerTube
    # npm install -g electron-prebuilt
    $ npm install
    $ npm run build
    $ npm start

### Test with 3 fresh nodes

    $ bin/clean_test.sh
    $ bin/run_servers.sh

Then you will can access to the three nodes at `http://localhost:900{1,2,3}`. If you call "make friends" on `http://localhost:9002`, the pod 2 and 3 will become friends. Then if you call "make friends" on `http://localhost:9001` it will become friend with the pod 2 and 3 (check the configuration files). Then the pod will communicate with each others. If you add a video on the pod 3 you'll can see it on the pod 1 and 2 :)

### Dockerfile

You can test it inside Docker with the [PeerTube-Docker repository](https://github.com/Chocobozzz/PeerTube-Docker). Moreover it can help you to check how to create an environment with the required dependencies for PeerTube on a GNU/Linux distribution.

## Architecture

See [ARCHITECTURE.md](https://github.com/Chocobozzz/PeerTube/blob/master/ARCHITECTURE.md) for a more detailed explication.

### Backend

  * The backend whould be a REST API
  * Servers would communicate with each others with it
    * Each server of a network has a list of all other servers of the network
    * When a new installed server wants to join a network, it just has to get the list of the servers via one server and tell them "Hi I'm new in the network, communicate with me too please"
    * Each server has its own users who query it (search videos, where the torrent URI of this specific video is...)
    * Server begins to seed and sends to the other servers of the network the video information (name, short description, torrent URI) of a new uploaded video
    * Each server has a RSA key to encrypt and sign communications with other servers
  * A server is a tracker responsible for all the videos uploaded in it
  * Even if nobody watches a video, it is seeded by the server where the video was uploaded
  * A server would run webtorrent-hybrid to be a bridge with webrtc/standard bittorrent protocol
  * A network can live and evolve by expelling bad pod (with too many downtimes for example)

See the ARCHITECTURE.md for more informations. Do not hesitate to give your opinion :)

Here are some simple schemes:

![Decentralized](http://lutim.cpy.re/aV2pawRz)

![Watch a video](http://lutim.cpy.re/AlOeoVPi)

![Watch a video P2P](http://lutim.cpy.re/fb0JH6C3)

![Join a network](http://lutim.cpy.re/ijuCgmpI)

![Many networks](http://lutim.cpy.re/iz8mXHug)

### Frontend

There would be a simple frontend (Bootstrap, AngularJS) but since the backend is a REST API anybody could build a frontend (Web application, desktop application...).
The backend uses bittorrent protocol, so users could use their favorite bittorrent client to download/play the video after having its torrent URI.
