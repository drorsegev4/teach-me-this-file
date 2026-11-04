// Small welcome-only translations; the rest of the interface keeps its existing labels.
export function welcomeCopy(language = '') {
  const name = language.toLowerCase();
  if (/hebrew|עברית/.test(name)) return {
    welcome: 'ברוכים הבאים לשיעור', topics: 'מה נלמד?', begin: 'בואו נתחיל', scope: 'בשיעור הזה',
    how: 'נלמד רעיון אחד בכל פעם, עם הסבר קצר ושאלות להבנה. אפשר לבקש עזרה ולעצור תשובה בכל רגע.',
    fallback: 'לפנינו שיעור המחבר בין הנושאים הבאים. נתקדם בהם יחד, צעד אחר צעד.',
  };
  if (/french|français/.test(name)) return {
    welcome: 'Bienvenue dans cette leçon', topics: 'Ce que nous allons apprendre', begin: 'Commençons', scope: 'Dans cette leçon',
    how: 'Nous avancerons une idée à la fois, avec de courtes explications et des questions. Vous pouvez demander de l’aide ou arrêter une réponse à tout moment.',
    fallback: 'Cette leçon relie les sujets ci-dessous. Nous les explorerons ensemble, étape par étape.',
  };
  if (/arabic|العربية/.test(name)) return {
    welcome: 'مرحبًا بكم في الدرس', topics: 'ماذا سنتعلم؟', begin: 'لنبدأ', scope: 'في هذا الدرس',
    how: 'سنتعلم فكرة واحدة في كل مرة، مع شرح قصير وأسئلة للفهم. يمكنك طلب المساعدة أو إيقاف الإجابة في أي وقت.',
    fallback: 'يربط هذا الدرس بين الموضوعات التالية. سنستكشفها معًا خطوة بخطوة.',
  };
  return {
    welcome: 'Welcome to your lesson', topics: 'What we’ll explore', begin: 'Let’s begin', scope: 'In this lesson',
    how: 'We’ll take one idea at a time, with short explanations and questions. You can ask for help or stop a reply at any point.',
    fallback: 'This lesson connects the topics below. We’ll explore them together, one step at a time.',
  };
}
