/* Web_NoAds for Loon 3.5.0. Local-only transformations; no network or storage APIs. */
const WebNoAds = (() => {
const CSS = {
    "jable": ".plyr__ads,.asg-interstitial,[id^=\"asg-\"],[id^=\"exo-native-widget-\"],[id^=\"exoNativeWidget\"],img[src*=\"tapioni.com/ab-banner.png\"],section.video-info>div.text-center>ins,section.video-info>div.text-center>iframe,.right-sidebar>div.text-center>iframe{display:none!important}",
    "xvideos": "#hlsplayer>.videoad-base,#ad-header-mobile-contener,#ad-footer,.exo-ad-ins-div.exo-ad-playersiderectangle,.exo-ad-ins-container.ad-support-desktop,.thumb-ad.thumb-nat-ad.thumb-nat-exo-ad,a.ignore-popunder[href^=\"https://s.\"]{display:none!important}",
    "pornhub": "ins.adsbytrafficjunky,#popsByTrafficJunky,#pb_iframe,.sideAds,.home-ad-container,.browse-ad-container,.playlist-ad-container,.communityAds,.photo-ad-container,#advertisementBox,.ad_box,.js-nativeTjVideoGrid.js_promoItem{display:none!important}"
};
const FOUR_K_SCRIPT = "((A,O)=>{const/**/isAdWorker=w=>{try{const/**/u=new/**/URL(w.scriptURL,location.href);return(u.origin===location.origin&&u.pathname===\"/interstitial.js\")}catch(e){return(false)}};(async()=>{let/**/reload=false;const/**/sw=navigator.serviceWorker;if(sw){const/**/rs=await/**/sw.getRegistrations().catch(()=>[]);await/**/Promise.all(rs.map(async(r)=>{const/**/workers=[r.active,r.waiting,r.installing].filter(isAdWorker);if(!workers.length)return;try{if(await/**/r.unregister())reload=reload||(isAdWorker(sw.controller)&&workers.some(w=>w.scriptURL===sw.controller.scriptURL))}catch(e){}}))}if(window.caches)await/**/caches.keys().then(ks=>Promise.all(ks.filter(k=>k===\"my-cache\"||k===\"img-cache\").map(k=>caches.delete(k).catch(()=>false)))).catch(()=>{});if(reload)location.reload()})().catch(()=>{});EventTarget.prototype.addEventListener=function(t,l,o){if(t===\"click\"&&typeof(l)===\"function\"&&/(?:popMagic|exoJsPop|pemsrv|magsrv)/.test(Function.prototype.toString.call(l)))return;return(A.apply(this,arguments))};window.open=function(u){try{const/**/h=new/**/URL(String(u),location.href);if(/(?:^|[.])(?:pemsrv|magsrv)[.]com$|^(?:pfec[.]uuss|online[.]ssuu)[.]uk$/i.test(h.hostname))return(null)}catch(e){}return(O.apply(this,arguments))};document.addEventListener(\"DOMContentLoaded\",()=>document.querySelectorAll('ins[class^=\"eas\"],ins[class^=\"adsby\"],.centbtd,.ex-over-top,#popmagicldr').forEach(e=>e.remove()),{once:true})})(EventTarget.prototype.addEventListener,window.open);";

    const SHARED_AD_DOMAINS = ['trafficjunky.net', 'adtng.com', 'dzhjmp.com', 'orbsrv.com',
        'ackcdn.net', 'aucdn.net', 'aacdn.net', 'rtbix.com', 'ad1n.net', 'rtbsuperhub.com',
        'tjk-njk.com', 'zline0.com', 'dszkvm.com', 'ktkjmp.com'];
    const HEAD = /^((?:[\s\uFEFF]|<!--(?:[^-]|-(?!->))*-->|<!doctype(?=[\s>])(?:[^<>"']|"[^"]*"|'[^']*')*>|<html(?=[\s>])(?:[^<>"']|"[^"]*"|'[^']*')*>)*<head(?=[\s>])(?:[^<>"']|"[^"]*"|'[^']*')*>)/i;
    const TAG = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>/i;
    const PIXIBB_HOST = /^(?:hub|sexy|cosplay)\.pixibb\.com$/;
    const PROMOTION_PATH = /^\/promotion\/(?:sexy-cosplay|sexy-girls)\/?$/;

    // Loon's JavaScript context is not a browser: do not depend on DOM or URL globals.
    function address(value, base) {
        if (typeof value !== 'string') return null;
        let text = value.trim();
        if (text.startsWith('//')) text = 'https:' + text;
        if (!/^https?:\/\//i.test(text)) {
            if (!base || /^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
            text = base.origin + (text.startsWith('/') ? text : base.path.replace(/[^/]*$/, '') + text);
        }
        const match = /^https?:\/\/([^\s/?#:@]+)(?::\d+)?(\/[^?#]*)?(?:[?#]|$)/i.exec(text);
        if (!match) return null;
        const host = match[1].toLowerCase().replace(/\.$/, '');
        return { host, path: match[2] || '/', origin: text.match(/^https?:\/\/[^/?#]+/i)[0] };
    }

    function siteFor(host) {
        if (/^(?:www\.)?4khd\.com$/.test(host)) return 'fourkhd';
        if (/^(?:www\.)?jable\.tv$/.test(host)) return 'jable';
        if (/^(?:www\.)?xvideos\.com$/.test(host)) return 'xvideos';
        if (/^(?:www\.)?pornhub\.com$/.test(host)) return 'pornhub';
        if (PIXIBB_HOST.test(host)) return 'pixibb';
        return null;
    }

    function enabled(options, site) {
        if (typeof options === 'string') options = JSON.parse(options);
        const value = options && options[site];
        return value == null || value === true || value === 'true';
    }

    function domainsFor(site) {
        if (site === 'fourkhd') return ['pemsrv.com', 'magsrv.com', 'pfec.uuss.uk', 'online.ssuu.uk'];
        return site === 'pixibb' ? ['happylength.com'] : SHARED_AD_DOMAINS;
    }

    function isPromotion(url) {
        return url && ((PIXIBB_HOST.test(url.host) && PROMOTION_PATH.test(url.path)) ||
            url.host === 'happylength.com' || url.host.endsWith('.happylength.com'));
    }

    function blockedResource(url, site) {
        if (!url) return false;
        if (domainsFor(site).some(domain => url.host === domain || url.host.endsWith('.' + domain))) return true;
        if (site === 'pixibb') return isPromotion(url);
        return site === 'pornhub' && url.host === 'static.trafficjunky.com' &&
            /^\/invocation\/(?:embeddedads|popunder)\//.test(url.path);
    }

    function blockedRequest(url, site) {
        if (site === 'fourkhd') return /^\/(?:interstitial\.js|js\/a1000d\.js)$/.test(url.path);
        if (site === 'pixibb') return isPromotion(url);
        return site === 'pornhub' && /^\/_xa\/ads(?:_batch)?$/.test(url.path);
    }

    function attribute(tag, name) {
        const attrs = /\s+([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
        let match;
        while ((match = attrs.exec(tag))) {
            if (match[1].toLowerCase() === name) return {
                value: match[3] ?? match[4] ?? match[5] ?? '',
                quote: match[3] !== undefined ? '"' : match[4] !== undefined ? "'" : '',
                start: match.index, end: attrs.lastIndex, raw: match[0], token: match[2]
            };
        }
        return null;
    }

    function decodeAttribute(value) {
        return value.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([0-9a-f]+));/gi, (entity, dec, hex) => {
            if (dec || hex) {
                const code = parseInt(dec || hex, dec ? 10 : 16);
                return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
            }
            return { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()];
        });
    }

    function classValue(tag, change) {
        const attr = attribute(tag, 'class');
        if (!attr || !attr.token) return tag.replace(/>$/, ' class="' + change('') + '">');
        const start = attr.start + attr.raw.lastIndexOf(attr.token);
        // Use quotes even if the old class was unquoted, as a new class adds whitespace.
        const quote = attr.quote || '"';
        return tag.slice(0, start) + quote + change(attr.value) + quote + tag.slice(attr.end);
    }

    function isPixibbAdScript(script) {
        // These markers occur together in the isolated promotion listener on all three audited hosts.
        return script.includes('pixibb_ad_cooldown') && /\bconst\s+adUrls\s*=/.test(script) &&
            /function\s+initAdListeners\s*\(/.test(script) &&
            /\bwindow\.open\s*\(\s*targetUrl\s*,/.test(script);
    }

    // A single pass over response text. Never scan live DOM mutations; skip comments and raw text.
    function cleanDocument(html, site, page) {
        let cursor = 0, output = '';
        while (cursor < html.length) {
            const start = html.indexOf('<', cursor);
            if (start < 0) return output + html.slice(cursor);
            output += html.slice(cursor, start);
            if (html.startsWith('<!--', start)) {
                const end = html.indexOf('-->', start + 4);
                if (end < 0) return null;
                output += html.slice(start, end + 3); cursor = end + 3; continue;
            }
            const remaining = html.slice(start);
            const declaration = /^<!doctype(?=[\s>])(?:[^<>"']|"[^"]*"|'[^']*')*>/i.exec(remaining);
            if (declaration) { output += declaration[0]; cursor = start + declaration[0].length; continue; }
            const token = TAG.exec(remaining);
            if (!token) {
                if (/^<\/?[a-z!]/i.test(remaining)) return null;
                output += '<'; cursor = start + 1; continue;
            }
            let tag = token[0];
            const name = token[2].toLowerCase();
            cursor = start + tag.length;
            if (token[1]) { output += tag; continue; }
            if (name === 'plaintext') return output + html.slice(start);
            const src = attribute(tag, 'src');
            const resource = src && address(decodeAttribute(src.value), page);
            if (/^(script|style|title|textarea|xmp|iframe|noembed|noframes|noscript)$/.test(name)) {
                const close = new RegExp('</' + name + '(?=[\\s/>])(?:[^<>"\']|"[^"]*"|\'[^\']*\')*>', 'ig');
                close.lastIndex = cursor;
                const end = close.exec(html);
                if (!end) return null;
                const inner = html.slice(cursor, end.index);
                const remove = ((name === 'script' || name === 'iframe') && blockedResource(resource, site)) ||
                    (name === 'script' && !src && site === 'pixibb' && isPixibbAdScript(inner));
                if (!remove) output += html.slice(start, close.lastIndex);
                cursor = close.lastIndex;
                continue;
            }
            if ((name === 'img' || name === 'embed') && blockedResource(resource, site)) continue;
            if (site === 'pornhub' && /(^|\s)js-popUnder(?=\s|$)/.test((attribute(tag, 'class') || {}).value || '')) {
                tag = classValue(tag, value => value.replace(/(^|\s)js-popUnder(?=\s|$)/g, '$1js-noPopUnder'));
            }
            if (site === 'pixibb' && name === 'a') {
                const href = attribute(tag, 'href'), rel = attribute(tag, 'rel');
                const target = href && address(decodeAttribute(href.value), page);
                const sponsored = target && /^(?:www\.)?filmxy\.vip$/.test(target.host) &&
                    /^\/ref\//.test(target.path) && rel && /(^|\s)sponsored(\s|$)/i.test(decodeAttribute(rel.value));
                if (isPromotion(target) || sponsored) tag = classValue(tag, value => value + ' loon-web-noads-promotion');
            }
            output += tag;
        }
        return output;
    }

    // Executed inside the enabled page, so shared ad domains never become global Loon rules.
    function popupGuard(domains, pixibb) {
        const blocked = value => {
            try {
                const url = new URL(String(value), location.href);
                const host = url.hostname.toLowerCase().replace(/\.$/, '');
                return domains.some(domain => host === domain || host.endsWith('.' + domain)) ||
                    (pixibb && /^(?:hub|sexy|cosplay)\.pixibb\.com$/.test(host) &&
                        /^\/promotion\/(?:sexy-cosplay|sexy-girls)\/?$/.test(url.pathname));
            } catch (_) { return false; }
        };
        const nativeOpen = window.open;
        window.open = function (url) {
            if (blocked(url)) return null;
            return nativeOpen.apply(this, arguments);
        };
        if (pixibb) {
            const stopPromotion = event => {
                const target = event.target && (event.target.closest ? event.target : event.target.parentElement);
                const link = target && target.closest && target.closest('a[href]');
                if (link && blocked(link.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
            };
            document.addEventListener('click', stopPromotion, true);
            document.addEventListener('auxclick', stopPromotion, true);
        }
    }

    function payload(site) {
        if (site === 'fourkhd') return '<script data-cfasync="false">' + FOUR_K_SCRIPT + '</script>';
        const css = site === 'pixibb' ? '.loon-web-noads-promotion{display:none!important}' : CSS[site];
        const guard = '(' + popupGuard.toString() + ')(' + JSON.stringify(domainsFor(site)) + ',' + (site === 'pixibb') + ');';
        return '<style>' + css + '</style><script data-cfasync="false">' + guard + '</script>';
    }

    function handle(request, response, options) {
        try {
            const url = address(request.url);
            const site = url && siteFor(url.host);
            if (!site || !enabled(options, site)) return {};
            if (!response) return blockedRequest(url, site) ? {
                response: { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: '' }
            } : {};
            const typeKey = Object.keys(response.headers || {}).find(key => key.toLowerCase() === 'content-type');
            const type = typeKey ? response.headers[typeKey] : '';
            if (type && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type)) return {};
            if (response.status && (response.status < 200 || response.status >= 300)) return {};
            const original = response.body;
            if (typeof original !== 'string' || !HEAD.test(original)) return {};
            const cleaned = cleanDocument(original, site, url);
            if (cleaned == null) return {};
            const body = cleaned.replace(HEAD, prefix => prefix + payload(site));
            return body === original ? {} : { body };
        } catch (_) {
            return {}; // Preserve the original response on unexpected input, without logging page/account data.
        }
    }

    return { handle };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WebNoAds;
else $done(WebNoAds.handle($request, typeof $response === 'undefined' ? null : $response,
    typeof $argument === 'undefined' ? null : $argument));
