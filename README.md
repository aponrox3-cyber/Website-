## Complete Website Downloader 💾
Download the complete source code of any website (including all assets) 🔨.

👉 Live Demo: https://website-downloader.onrender.com

![enter image description here](https://github.com/AhmadIbrahiim/Website-downloader/blob/master/public/Record.gif?raw=true)
<div align="center">

  <a href="">![CodeFactor](https://www.codefactor.io/repository/github/ahmadibrahiim/website-downloader/badge)</a>

</div>

## Description 📒
 Website downloader works with `wget` and `archiver` to download all websites assets and compress then sends it back to the user through socket channel
 
 **wget params the being used**
 
 `wget --mirror --convert-links --adjust-extension --page-requisites http://example.org`
 (plus retries, a browser user agent and subdomain following; see `wget/index.js`)

 **Explanation of the various flags:**

 - --mirror – Makes (among other things) the download recursive.
- --convert-links – convert all the links (also to stuff like CSS stylesheets) to relative, so it will be suitable for offline viewing.
- --adjust-extension – Adds suitable extensions to filenames (html or css) depending on their content-type.
- --page-requisites – Download things like CSS style-sheets and images required to properly display the page offline.
- --no-parent – When recursing do not ascend to the parent directory. Only used when `DOWNLOAD_SCOPE=page`
### Deploy on cloud providers
[![Run on Replit](https://binbashbanana.github.io/deploy-buttons/buttons/remade/replit.svg)](https://replit.com/github/AhmadIbrahiim/Website-downloader)
[![Remix on Glitch](https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg)](https://glitch.com/edit/#!/import/github/AhmadIbrahiim/Website-downloader)
[![Deploy on Railway](https://binbashbanana.github.io/deploy-buttons/buttons/remade/railway.svg)](https://railway.app/new/template?template=https://github.com/AhmadIbrahiim/Website-downloader)
[![Deploy to Koyeb](https://binbashbanana.github.io/deploy-buttons/buttons/remade/koyeb.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/AhmadIbrahiim/Website-downloader&branch=main&name=Website-downloader)
[![Deploy to Render](https://binbashbanana.github.io/deploy-buttons/buttons/remade/render.svg)](https://render.com/deploy?repo=https://github.com/AhmadIbrahiim/Website-downloader)


## Requirements 📦

- Node.js 16 or newer
- `wget` on the `PATH`. The app shells out to it, and nothing will download without it:
  - Debian/Ubuntu: `apt install wget`
  - macOS: `brew install wget`
  - Windows: `winget install JernejSimoncic.Wget`

## Quick start on Ubuntu 🐧

```
git clone https://github.com/aponrox3-cyber/Website-.git
cd Website-
bash setup-ubuntu.sh        # installs wget, Node.js, dependencies and headless Chromium
npm start                   # then open http://localhost:3000
```

Upload with `git add -A && git commit && git push`, not the GitHub web uploader: the web uploader flattens folders and breaks the app.

## How to run it 🤔

- `git clone https://github.com/AhmadIbrahiim/Website-downloader.git`
- `cd Website-downloader`
- `$ npm install`
- `$ npm start`
- `http://localhost:3000/`

### Optional settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DOWNLOAD_QUOTA` | `0` (unlimited) | Optional size cap passed to wget, e.g. `500m` or `2g`; `0` means no limit |
| `DOWNLOAD_SCOPE` | `site` | `site` copies the whole site even from a sub-page; `page` stays under the starting folder |
| `DOWNLOAD_WAIT` | `0` | Seconds to pause between requests (randomised), for servers that block fast crawlers |
| `DOWNLOAD_USER_AGENT` | Chrome | Browser identity sent to the server |
| `DOWNLOAD_TIMEOUT_MS` | `0` (unlimited) | Optional limit in milliseconds for a single download; `0` means no limit |
| `ALLOW_PRIVATE_HOSTS` | off | By default addresses on private/internal networks (localhost, 10.x, 192.168.x, cloud metadata) are refused so a public deployment cannot be used to reach internal services. Set to `1` when running on your own machine to copy a local site |
| `MAX_CONCURRENT_JOBS` | `5` | Downloads allowed to run at the same time |
| `ZIP_TTL_MINUTES` | `60` | Finished zips are deleted after this long |



# How To Contribute:
 - Open Issue(s) with any bugs you notice.
 - Please create Pull Requests if you think it would be an added value towards our program.

## Liked it ? You can buy a coffee:

<a href="https://www.buymeacoffee.com/aibrahim" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

Thank you,

Email: me@ahmed-ibrahim.com

https://www.ahmed-ibrahim.com

## Full copy engine (JavaScript sites)

By default the app uses a real headless Chromium (Playwright) when it is installed, and falls back to wget when it is not. The browser engine runs the site's JavaScript, so React/Vue/Next.js/Lovable-style sites are copied completely.

Setup once:

```
npm install
npm run setup-browser
```

The zip you download contains:

- `<site>/` – every file the browser received (HTML, JS, CSS, fonts, images, JSON API GET responses), plus files from CDNs in their own folders
- `_rendered/` – every page after JavaScript ran
- `_sources/` – original source code rebuilt from source maps (when the site publishes them)
- `_manifest.json`, `serve.js`, `READ-ME-FIRST.txt` – run `node serve.js` inside the unzipped folder to open the copy offline

Server-side code, databases and secrets cannot be copied by any downloader; POST requests (logins, forms) are not saved.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOWNLOAD_ENGINE` | `auto` | `auto`, `browser` or `wget` |
| `CRAWL_CONCURRENCY` | `3` | Pages opened in parallel |
| `CRAWL_MAX_PAGES` | `0` (unlimited) | Stop after this many pages |
| `CRAWL_MAX_QUERY_VARIANTS` | `20` | Max `?query` variants crawled per path (avoids endless calendars/filters) |
| `CRAWL_PAGE_TIMEOUT_MS` | `60000` | Wait per page load |
| `CRAWL_VENDOR_SOURCES` | `0` | `1` also extracts `node_modules` sources from source maps |
