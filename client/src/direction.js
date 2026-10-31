// Language flexibility: text direction comes from the content, not from the interface language.
// Free text gets dir="auto" so the browser picks the direction per paragraph from its first letter.
// A whole lesson switches its layout to right-to-left when its language is written that way.

const RTL_LANGUAGE = /hebrew|arabic|persian|farsi|urdu|עברית|العربية|فارسی|اردو/i;

export function languageDirection(language) {
  return language && RTL_LANGUAGE.test(language) ? 'rtl' : 'ltr';
}
