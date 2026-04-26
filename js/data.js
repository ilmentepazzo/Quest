const storiesData = [
  {
    id: 1,
    masterId: 1,
    title: "La Maschera del Re Corvo",
    genre: "Fantasy",
    type: "Con Master",
    price: 15,
    isFree: false,
    duration: "2 ore",
    players: "3–5",
    level: "Intermedio",
    mode: "Online",
    master: "Arianna V.",
    desc: "Intrighi, reliquie proibite e tradimenti in una corte decadente.",
    long: "Esperienza guidata da Master, ideale per gruppi che amano scelte morali, misteri e momenti epici.",
    cover: "",
    trailer: "",
    materials: [
      {
        name: "Mappa della corte del Re Corvo",
        type: "Mappa",
        visibility: "Durante sessione",
        notes: "Mappa riservata da mostrare ai giocatori quando entrano nella corte."
      },
      {
        name: "Lettera sigillata",
        type: "Indizio",
        visibility: "Durante sessione",
        notes: "Indizio narrativo che il Master può rivelare a metà sessione."
      }
    ]
  },
  {
    id: 2,
    masterId: 2,
    title: "Ultimo Brindisi",
    genre: "Cena con delitto",
    type: "Self-play",
    price: 0,
    isFree: true,
    duration: "90 min",
    players: "4–8",
    level: "Facile",
    mode: "Dal vivo",
    master: "Studio Enigma",
    desc: "Un ricevimento elegante, un omicidio improvviso e troppi sospettati.",
    long: "Storia pronta da giocare senza Master. Include ruoli, indizi e struttura della serata.",
    cover: "",
    trailer: "",
    materials: [
      {
        name: "Schede personaggio",
        type: "PDF",
        visibility: "Dopo acquisto",
        notes: "Materiale da distribuire ai partecipanti prima dell’inizio."
      }
    ]
  },
  {
    id: 3,
    masterId: 3,
    title: "Black Hollow",
    genre: "Horror",
    type: "Con Master",
    price: 20,
    isFree: false,
    duration: "3 ore",
    players: "2–6",
    level: "Esperto",
    mode: "Online",
    master: "Lorenzo M.",
    desc: "Un manicomio abbandonato custodisce qualcosa che non vuole essere trovato.",
    long: "Esperienza horror investigativa con atmosfera cupa, tensione crescente e scene intense.",
    cover: "",
    trailer: "",
    materials: [
      {
        name: "Registrazione audio disturbata",
        type: "Audio",
        visibility: "Durante sessione",
        notes: "File audio da far ascoltare ai giocatori durante l’esplorazione."
      }
    ]
  }
];

const mastersData = [
  {
    id: 1,
    name: "Arianna V.",
    rating: "4.9",
    sessions: 127,
    price: "da 20€",
    mode: "Online / Dal vivo",
    language: "Italiano",
    availability: "Sere e weekend",
    bio: "Specializzata in fantasy narrativo, campagne immersive e one-shot professionali.",
    longBio: "Conduco sessioni da oltre 6 anni, con attenzione al ritmo narrativo, all’inclusione dei giocatori e alla creazione di momenti memorabili.",
    specialties: ["Fantasy", "Investigativo", "One-shot", "Online"]
  },
  {
    id: 2,
    name: "Studio Enigma",
    rating: "4.8",
    sessions: 89,
    price: "da 15€",
    mode: "Dal vivo",
    language: "Italiano",
    availability: "Weekend",
    bio: "Esperti in mystery dinner, cene con delitto ed esperienze investigative.",
    longBio: "Creiamo esperienze immersive per gruppi privati, eventi aziendali e serate speciali.",
    specialties: ["Cena con delitto", "Mystery", "Eventi"]
  },
  {
    id: 3,
    name: "Lorenzo M.",
    rating: "5.0",
    sessions: 64,
    price: "da 25€",
    mode: "Online",
    language: "Italiano / Inglese",
    availability: "Sera",
    bio: "Master horror e investigativo con forte focus su atmosfera e immersione.",
    longBio: "Specializzato in one-shot horror intense, sessioni investigative e narrazione psicologica.",
    specialties: ["Horror", "Investigativo", "Online"]
  }
];

const reviewsData = [
  {
    id: 1,
    masterId: 1,
    author: "Marco",
    rating: 5,
    date: "Aprile 2026",
    text: "Sessione incredibile, preparata benissimo. Torneremo sicuramente."
  },
  {
    id: 2,
    masterId: 1,
    author: "Giulia",
    rating: 5,
    date: "Marzo 2026",
    text: "Master molto professionale, atmosfera fantastica e gruppo sempre coinvolto."
  },
  {
    id: 3,
    masterId: 2,
    author: "Elena",
    rating: 5,
    date: "Febbraio 2026",
    text: "Cena con delitto perfetta per il nostro evento aziendale. Super consigliato."
  },
  {
    id: 4,
    masterId: 3,
    author: "Davide",
    rating: 5,
    date: "Aprile 2026",
    text: "Atmosfera horror pazzesca. Esperienza intensa e super immersiva."
  }
];