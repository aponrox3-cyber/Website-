/**
 * Technology signatures.
 *
 * Each entry says how to recognise one technology:
 *   re  - tested against the page HTML + every file URL + the start of the JS bundles
 *   h   - tested against the response headers ("name: value" lines)
 *   ck  - tested against cookie names
 *   rt  - a flag collected from the live page (see collectRuntime in browser/index.js)
 *   v   - regex whose first group is the version, tried on the same text as `re`
 */
module.exports = [
  // ---- JavaScript frameworks ----
  { n: 'React', c: 'JavaScript framework', rt: 'react', re: /data-reactroot|react-dom(?:\.|-)|__reactFiber|_reactRootContainer|react\.production/i, v: /react(?:-dom)?@(\d+\.\d+\.\d+)/i },
  { n: 'Next.js', c: 'JavaScript framework', rt: 'next', re: /\/_next\/static|__NEXT_DATA__/ },
  { n: 'Vue.js', c: 'JavaScript framework', rt: 'vue', re: /data-v-[0-9a-f]{6,}|vue(?:\.runtime)?(?:\.global)?(?:\.prod)?\.js|__VUE__/i, v: /vue@(\d+\.\d+\.\d+)/i },
  { n: 'Nuxt', c: 'JavaScript framework', rt: 'nuxt', re: /\/_nuxt\/|__NUXT__/ },
  { n: 'Angular', c: 'JavaScript framework', rt: 'angular', re: /ng-version=|<app-root|ng-reflect-|zone\.js/i },
  { n: 'AngularJS', c: 'JavaScript framework', rt: 'angularjs', re: /\bng-app\b|angular(?:\.min)?\.js/i },
  { n: 'Svelte', c: 'JavaScript framework', re: /svelte-[a-z0-9]{5,}|\/_app\/immutable\//i },
  { n: 'Gatsby', c: 'JavaScript framework', rt: 'gatsby', re: /___gatsby|\/page-data\/|gatsby-/i },
  { n: 'Astro', c: 'JavaScript framework', re: /astro-island|\/_astro\/|astro-[a-z0-9]{8}/i },
  { n: 'Remix', c: 'JavaScript framework', rt: 'remix', re: /__remixContext|\/build\/_assets\//i },
  { n: 'Alpine.js', c: 'JavaScript framework', re: /\bx-data=|alpinejs/i },
  { n: 'htmx', c: 'JavaScript framework', re: /\bhx-(?:get|post|trigger|target)=|htmx(?:\.min)?\.js/i },
  { n: 'jQuery', c: 'JavaScript library', re: /jquery[-.\/@]?(?:\d|min)|jQuery JavaScript Library/i, v: /jQuery(?: JavaScript Library)? v?(\d+\.\d+\.\d+)|jquery[-.@\/](\d+\.\d+\.\d+)/i },
  { n: 'Lodash', c: 'JavaScript library', re: /lodash(?:\.min)?\.js|lodash@/i },
  { n: 'Axios', c: 'JavaScript library', re: /axios(?:\.min)?\.js|axios@/i },
  { n: 'GSAP', c: 'JavaScript library', re: /gsap(?:\.min)?\.js|gsap@|TweenMax/i },
  { n: 'Three.js', c: 'JavaScript library', re: /three(?:\.min|\.module)?\.js|three@|THREE\.WebGLRenderer/i },
  { n: 'Swiper', c: 'JavaScript library', re: /swiper(?:-bundle)?(?:\.min)?\.(?:js|css)|swiper@/i },
  { n: 'Chart.js', c: 'JavaScript library', re: /chart(?:\.umd)?(?:\.min)?\.js|chart\.js@/i },
  { n: 'D3', c: 'JavaScript library', re: /d3(?:\.v\d)?(?:\.min)?\.js|d3@/i },
  { n: 'Socket.IO', c: 'JavaScript library', re: /socket\.io\.js|socket\.io-client/i },
  { n: 'Leaflet', c: 'JavaScript library', re: /leaflet(?:\.min)?\.(?:js|css)|leaflet@/i },
  { n: 'Moment.js', c: 'JavaScript library', re: /moment(?:\.min)?\.js|moment@/i },

  // ---- Build tools ----
  { n: 'webpack', c: 'Build tool', re: /webpackChunk|webpackJsonp|__webpack_require__/ },
  { n: 'Vite', c: 'Build tool', re: /\/@vite\/client|\/assets\/index-[\w-]{8}\.(?:js|css)|vite\/modulepreload-polyfill/i },
  { n: 'Parcel', c: 'Build tool', re: /parcelRequire|\.parcel-/ },
  { n: 'Service worker / PWA', c: 'Web platform', re: /serviceWorker\.register|manifest\.(?:webmanifest|json)/i },

  // ---- CSS / UI ----
  { n: 'Bootstrap', c: 'CSS framework', re: /bootstrap(?:\.min|\.bundle)?\.(?:css|js)|bootstrap@|\/bootstrap\//i, v: /bootstrap(?:@|\/|-|\.min\.css\?v=|\sv)v?(\d+\.\d+\.\d+)/i },
  { n: 'Tailwind CSS', c: 'CSS framework', re: /tailwindcss|cdn\.tailwindcss\.com/i },
  { n: 'Bulma', c: 'CSS framework', re: /bulma(?:\.min)?\.css/i },
  { n: 'Foundation', c: 'CSS framework', re: /foundation(?:\.min)?\.(?:css|js)/i },
  { n: 'Material UI', c: 'UI library', re: /\bMui[A-Z][A-Za-z]+-root|@mui\//i },
  { n: 'Font Awesome', c: 'Icons', re: /font-?awesome|fontawesome|\bfa-(?:solid|brands|regular)\b/i },
  { n: 'Google Fonts', c: 'Fonts', re: /fonts\.googleapis\.com|fonts\.gstatic\.com/i },
  { n: 'Adobe Fonts (Typekit)', c: 'Fonts', re: /use\.typekit\.net|fonts\.adobe\.com/i },

  // ---- CMS / site builders / e-commerce ----
  { n: 'WordPress', c: 'CMS', re: /\/wp-content\/|\/wp-includes\/|<meta[^>]+generator[^>]+WordPress/i, h: /x-pingback|link:.*wp-json/i, v: /generator"?\s+content="WordPress (\d+[\d.]*)/i },
  { n: 'WooCommerce', c: 'E-commerce', re: /woocommerce/i },
  { n: 'Shopify', c: 'E-commerce', rt: 'shopify', re: /cdn\.shopify\.com|Shopify\.theme/i, h: /x-shopify-stage/i },
  { n: 'Wix', c: 'Site builder', re: /wixstatic\.com|wix-code|X-Wix/i, h: /x-wix-request-id/i },
  { n: 'Squarespace', c: 'Site builder', re: /squarespace\.com|static1\.squarespace/i },
  { n: 'Webflow', c: 'Site builder', re: /data-wf-page|data-wf-site|webflow\.(?:js|css)|assets\.website-files\.com/i },
  { n: 'Framer', c: 'Site builder', re: /framerusercontent\.com|data-framer-|framer\.com\/m\//i },
  { n: 'Lovable / GPT Engineer', c: 'Site builder', re: /lovable\.(?:dev|app)|gptengineer\.js|cdn\.gpteng\.co/i },
  { n: 'Drupal', c: 'CMS', re: /Drupal\.settings|\/sites\/default\/files|<meta[^>]+generator[^>]+Drupal/i, h: /x-drupal-cache|x-generator:\s*Drupal/i },
  { n: 'Joomla', c: 'CMS', re: /\/media\/jui\/|<meta[^>]+generator[^>]+Joomla/i },
  { n: 'Ghost', c: 'CMS', re: /<meta[^>]+generator[^>]+Ghost|ghost-(?:url|sdk)/i },
  { n: 'Magento', c: 'E-commerce', re: /\/static\/frontend\/|Mage\.Cookies|mage\/cookies/i },
  { n: 'Contentful', c: 'Headless CMS', re: /ctfassets\.net|contentful\.com/i },
  { n: 'Sanity', c: 'Headless CMS', re: /cdn\.sanity\.io/i },
  { n: 'Strapi', c: 'Headless CMS', re: /strapi/i, h: /x-powered-by:\s*Strapi/i },

  // ---- Hosting / CDN ----
  { n: 'Cloudflare', c: 'CDN / hosting', h: /^cf-ray:|server:\s*cloudflare/im, re: /cdnjs\.cloudflare\.com|cloudflareinsights\.com/i },
  { n: 'Vercel', c: 'CDN / hosting', h: /x-vercel-id|server:\s*vercel/i },
  { n: 'Netlify', c: 'CDN / hosting', h: /x-nf-request-id|server:\s*netlify/i },
  { n: 'Amazon CloudFront', c: 'CDN / hosting', h: /x-amz-cf-id|via:.*cloudfront/i },
  { n: 'Amazon S3', c: 'CDN / hosting', h: /server:\s*AmazonS3/i },
  { n: 'GitHub Pages', c: 'CDN / hosting', h: /x-github-request-id|server:\s*GitHub\.com/i },
  { n: 'Fastly', c: 'CDN / hosting', h: /x-served-by|via:.*varnish|fastly/i },
  { n: 'Akamai', c: 'CDN / hosting', h: /akamai/i },
  { n: 'Firebase Hosting', c: 'CDN / hosting', h: /x-firebase-hosting-version/i, re: /firebaseapp\.com|web\.app\//i },
  { n: 'Heroku', c: 'CDN / hosting', h: /via:.*vegur/i },
  { n: 'Google Cloud', c: 'CDN / hosting', h: /server:\s*(?:gws|ghs|Google Frontend|ESF)/i },
  { n: 'Microsoft Azure', c: 'CDN / hosting', h: /x-azure-ref|x-ms-request-id/i },
  { n: 'jsDelivr / unpkg / cdnjs', c: 'Library CDN', re: /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/i },

  // ---- Servers and back-end clues ----
  { n: 'nginx', c: 'Web server', h: /server:\s*nginx/i, v: null },
  { n: 'Apache', c: 'Web server', h: /server:\s*Apache/i },
  { n: 'LiteSpeed', c: 'Web server', h: /server:\s*LiteSpeed|x-litespeed-cache/i },
  { n: 'Microsoft IIS', c: 'Web server', h: /server:\s*Microsoft-IIS/i },
  { n: 'Caddy', c: 'Web server', h: /server:\s*Caddy/i },
  { n: 'PHP', c: 'Back-end language', h: /x-powered-by:\s*PHP/i, ck: /PHPSESSID/ },
  { n: 'ASP.NET', c: 'Back-end framework', h: /x-aspnet-version|x-powered-by:\s*ASP\.NET/i, ck: /ASP\.NET_SessionId/, re: /\.aspx\b|__VIEWSTATE/ },
  { n: 'Express (Node.js)', c: 'Back-end framework', h: /x-powered-by:\s*Express/i },
  { n: 'Laravel', c: 'Back-end framework', ck: /laravel_session/ },
  { n: 'Django', c: 'Back-end framework', ck: /csrftoken/, re: /csrfmiddlewaretoken/ },
  { n: 'Ruby on Rails', c: 'Back-end framework', h: /x-runtime/i, re: /name="csrf-param"|authenticity_token/ },
  { n: 'Java (JSP/Servlet)', c: 'Back-end language', ck: /JSESSIONID/ },

  // ---- Analytics / marketing / support ----
  { n: 'Google Analytics', c: 'Analytics', rt: 'ga', re: /google-analytics\.com|googletagmanager\.com\/gtag\/js|gtag\(/i },
  { n: 'Google Tag Manager', c: 'Analytics', rt: 'gtm', re: /googletagmanager\.com\/gtm\.js/i },
  { n: 'Meta (Facebook) Pixel', c: 'Marketing', rt: 'fbq', re: /connect\.facebook\.net|fbq\(/i },
  { n: 'Hotjar', c: 'Analytics', re: /static\.hotjar\.com|hotjar-/i },
  { n: 'Microsoft Clarity', c: 'Analytics', re: /clarity\.ms/i },
  { n: 'Plausible', c: 'Analytics', re: /plausible\.io\/js/i },
  { n: 'Mixpanel', c: 'Analytics', re: /mixpanel/i },
  { n: 'Segment', c: 'Analytics', re: /cdn\.segment\.com/i },
  { n: 'LinkedIn Insight', c: 'Marketing', re: /snap\.licdn\.com/i },
  { n: 'TikTok Pixel', c: 'Marketing', re: /analytics\.tiktok\.com/i },
  { n: 'HubSpot', c: 'Marketing', re: /js\.hs-scripts\.com|hsforms|hubspot/i },
  { n: 'Intercom', c: 'Support chat', re: /widget\.intercom\.io|intercomSettings/i },
  { n: 'Crisp', c: 'Support chat', re: /client\.crisp\.chat/i },
  { n: 'Tawk.to', c: 'Support chat', re: /embed\.tawk\.to/i },
  { n: 'Stripe', c: 'Payments', re: /js\.stripe\.com/i },
  { n: 'PayPal', c: 'Payments', re: /paypal\.com\/sdk|paypalobjects\.com/i },
  { n: 'reCAPTCHA', c: 'Security', re: /google\.com\/recaptcha|recaptcha\/api\.js/i },
  { n: 'hCaptcha', c: 'Security', re: /hcaptcha\.com/i },
  { n: 'Cloudflare Turnstile', c: 'Security', re: /challenges\.cloudflare\.com\/turnstile/i },
  { n: 'Sentry', c: 'Monitoring', re: /sentry-cdn\.com|browser\.sentry|@sentry\//i },
  { n: 'Firebase', c: 'Back-end service', re: /firebaseio\.com|firebase(?:-app)?(?:\.js|\/)|gstatic\.com\/firebasejs/i },
  { n: 'Supabase', c: 'Back-end service', re: /\.supabase\.(?:co|in)/i },
  { n: 'Algolia', c: 'Search', re: /algolia(?:net)?\.(?:net|com)|algoliasearch/i },
  { n: 'Google Maps', c: 'Maps', re: /maps\.googleapis\.com|google\.com\/maps\/embed/i },
  { n: 'Mapbox', c: 'Maps', re: /api\.mapbox\.com|mapbox-gl/i },
  { n: 'YouTube embed', c: 'Media', re: /youtube(?:-nocookie)?\.com\/embed|ytimg\.com/i },
  { n: 'Vimeo embed', c: 'Media', re: /player\.vimeo\.com/i },
  { n: 'GraphQL', c: 'API style', re: /\/graphql\b|__typename/i }
];
