export type LessonBlock =
  | { type: 'text'; title?: string; body: string }
  | { type: 'imageGrid'; title?: string; items: { label: string; note?: string }[] }
  | { type: 'video'; title?: string; url: string }           // p.ej. https://www.youtube.com/embed/xxxx
  | { type: 'callout'; kind?: 'info' | 'tip' | 'warning'; body: string };

export type LessonContent = {
  moduleTitle: string;
  lessonTitle: string;
  blocks: LessonBlock[];
  next?: { lessonKey: string; title: string };
  prev?: { lessonKey: string; title: string };
};

// Utilidad rápida para crear tarjetas de letras
const letters = (from: string, to: string) => {
  const a = from.charCodeAt(0), b = to.charCodeAt(0);
  const arr: { label: string }[] = [];
  for (let c = a; c <= b; c++) arr.push({ label: String.fromCharCode(c) });
  return arr;
};

// Utilidad para crear tarjetas de números
const numbers = (from: number, to: number) => {
  const arr: { label: string }[] = [];
  for (let n = from; n <= to; n++) arr.push({ label: n.toString() });
  return arr;
};

// ----- Contenido ABECEDARIO -----
function abecedarioContent(lessonKey: string): LessonContent | null {
  if (lessonKey === 'A_I') {
    return {
      moduleTitle: 'Abecedario',
      lessonTitle: 'Segmento 1 (A–I)',
      blocks: [
        { type: 'text', title: 'Objetivo', body: 'Reconocer y practicar las señas de las letras A–I en LENSEGUA.' },
        { type: 'imageGrid', title: 'Letras A–I', items: letters('A','I') },
        { type: 'callout', kind: 'tip', body: 'Consejo: practica frente a un espejo para verificar la orientación de la mano.' },
        // Puedes cambiar por un video real cuando lo tengas
        { type: 'video', title: 'Demostración', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
      ],
      next: { lessonKey: 'J_R', title: 'Segmento 2 (J–R)' }
    };
  }
  if (lessonKey === 'J_R') {
    return {
      moduleTitle: 'Abecedario',
      lessonTitle: 'Segmento 2 (J–R)',
      blocks: [
        { type: 'text', title: 'Objetivo', body: 'Reconocer y practicar las señas de las letras J–R.' },
        { type: 'imageGrid', title: 'Letras J–R', items: letters('J','R') },
        { type: 'callout', kind: 'info', body: 'Recuerda: algunas letras se distinguen por movimiento; presta atención al inicio/fin.' },
      ],
      prev: { lessonKey: 'A_I', title: 'Segmento 1 (A–I)' },
      next: { lessonKey: 'S_Z', title: 'Segmento 3 (S–Z)' }
    };
  }
  if (lessonKey === 'S_Z') {
    return {
      moduleTitle: 'Abecedario',
      lessonTitle: 'Segmento 3 (S–Z)',
      blocks: [
        { type: 'text', title: 'Objetivo', body: 'Reconocer y practicar las señas de las letras S–Z.' },
        { type: 'imageGrid', title: 'Letras S–Z', items: letters('S','Z') },
        { type: 'callout', kind: 'warning', body: 'Errores comunes: confundir S con T por la posición del pulgar.' },
      ],
      prev: { lessonKey: 'J_R', title: 'Segmento 2 (J–R)' }
    };
  }
  return null;
}

// ----- Contenido NÚMEROS -----
function numerosContent(lessonKey: string): LessonContent | null {
  if (lessonKey === '1_5') {
    return {
      moduleTitle: 'Números',
      lessonTitle: 'Segmento 1 (1–5)',
      blocks: [
        { type: 'text', title: 'Objetivo', body: 'Aprender las señas de los números del 1 al 5 en LENSEGUA.' },
        { type: 'imageGrid', title: 'Números 1–5', items: numbers(1, 5) },
        { type: 'callout', kind: 'tip', body: 'Consejo: los números se forman con configuraciones específicas de los dedos. Practica la posición de cada dedo.' },
      ],
      next: { lessonKey: '6_10', title: 'Segmento 2 (6–10)' }
    };
  }
  if (lessonKey === '6_10') {
    return {
      moduleTitle: 'Números',
      lessonTitle: 'Segmento 2 (6–10)',
      blocks: [
        { type: 'text', title: 'Objetivo', body: 'Aprender las señas de los números del 6 al 10 en LENSEGUA.' },
        { type: 'imageGrid', title: 'Números 6–10', items: numbers(6, 10) },
        { type: 'callout', kind: 'info', body: 'Recuerda: la orientación de la mano es importante para números mayores a 5.' },
      ],
      prev: { lessonKey: '1_5', title: 'Segmento 1 (1–5)' }
    };
  }
  return null;
}

export function getLessonContent(moduleKey: string, lessonKey: string): LessonContent | null {
  const mk = moduleKey.toUpperCase();
  if (mk === 'ABECEDARIO') return abecedarioContent(lessonKey);
  if (mk === 'NUMEROS') return numerosContent(lessonKey);
  return null;
}
