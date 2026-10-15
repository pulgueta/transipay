export const THEME_STORAGE_KEY = "transipay-theme";

/**
 * Runs in the document head before the first paint.
 * It applies the stored choice, or the system preference, so the page does not flash.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark")}}catch(e){}})();`;
