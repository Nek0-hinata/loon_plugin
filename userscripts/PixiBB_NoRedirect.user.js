// ==UserScript==
// @name         PixiBB 防跳转（保留视频播放）
// @namespace    https://github.com/Nek0-hinata/loon_plugin
// @version      1.0.0
// @description  阻止 PixiBB 全页点击推广和 happylength 跳转，不改动视频 iframe、Plyr 或媒体接口。
// @author       Codex
// @match        https://hub.pixibb.com/*
// @match        https://sexy.pixibb.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/userscripts/PixiBB_NoRedirect.user.js
// @updateURL    https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/userscripts/PixiBB_NoRedirect.user.js
// ==/UserScript==

(function () {
  "use strict";

  const promotionPath = /^\/promotion\/(?:sexy-cosplay|sexy-girls)\/?$/i;
  const blockedHost = /^(?:www\.)?happylength\.com$/i;

  function isPromotionUrl(value) {
    try {
      const url = new URL(String(value), location.href);
      return (
        blockedHost.test(url.hostname) ||
        (/^(?:hub|sexy)\.pixibb\.com$/i.test(url.hostname) && promotionPath.test(url.pathname))
      );
    } catch (_error) {
      return false;
    }
  }

  // The site skips its document-wide click listener while this cooldown cookie exists.
  const cookie = "pixibb_ad_cooldown=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure";
  document.cookie = `${cookie}; Domain=.pixibb.com`;
  document.cookie = cookie;

  // Stop a promotion intermediary immediately, including one opened from an older cached page.
  if (promotionPath.test(location.pathname)) {
    location.replace(`${location.origin}/`);
    return;
  }

  // Narrow fallback: block only the two audited promotion paths and their current final host.
  const nativeOpen = window.open;
  window.open = function (url, target, features) {
    if (isPromotionUrl(url)) return null;
    return Reflect.apply(nativeOpen, window, [url, target, features]);
  };
})();
