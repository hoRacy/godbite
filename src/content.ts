export type Language = 'en' | 'pl';
export type Chapter = 'threshold' | 'music' | 'cinema' | 'contact';
export interface Release {
  id: string; title: string; year: number; kind: 'album' | 'ep' | 'single';
  cover: string; bandcamp: string; spotify?: string; artwork?: string;
}
export interface Film {
  id: string; title: string; youtubeId: string; kind: 'video' | 'visualiser';
}
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const releases: Release[] = [
  { id: 'social-media-girls', title: 'Social Media Girls', year: 2026, kind: 'single', cover: 'social-media-girls', bandcamp: 'https://godbite.bandcamp.com/album/social-media-girls', spotify: 'https://open.spotify.com/album/4yji0Hoa0DhRDht4PMfB3z', artwork: 'Trash Boat' },
  { id: 'jism', title: 'JISM', year: 2025, kind: 'ep', cover: 'jism', bandcamp: 'https://godbite.bandcamp.com/album/jism', spotify: 'https://open.spotify.com/album/7nYGh0vFxKyXKLRSkCtpOz', artwork: 'Trash Boat' },
  { id: 'mir', title: 'Mir', year: 2023, kind: 'album', cover: 'mir', bandcamp: 'https://godbite.bandcamp.com/album/mir', spotify: 'https://open.spotify.com/album/4Rdud3cjsccagcNbBwBRhk', artwork: 'Artur Ciechorski' },
  { id: 'the-aristocrats', title: 'the Aristocrats', year: 2015, kind: 'album', cover: 'the-aristocrats', bandcamp: 'https://godbite.bandcamp.com/album/the-aristocrats' },
  { id: 'horse', title: 'You can lead a horse EP', year: 2011, kind: 'ep', cover: 'demo', bandcamp: 'https://godbite.bandcamp.com/album/demo' },
];
export const films: Film[] = [
  { id: 'social-media-girls', title: 'Social Media Girls', youtubeId: 'y5Bw0fB5nU8', kind: 'video' },
  { id: 'walkin-phoenix', title: 'Walkin’ Phoenix', youtubeId: 'KlZBHri5y1Q', kind: 'video' },
  { id: 'tarrare-52', title: 'Tarrare 52', youtubeId: 'p68ABWJqxCI', kind: 'video' },
  { id: 'elbow-grease', title: 'Elbow Grease', youtubeId: 'Fu1c32l8bqk', kind: 'visualiser' },
];
export const socials = [
  ['Instagram', 'https://www.instagram.com/godbite.pl/'],
  ['YouTube', 'https://www.youtube.com/@godbiteband'],
  ['Bandcamp', 'https://godbite.bandcamp.com/'],
  ['Spotify', 'https://open.spotify.com/artist/7coe5YJdUFZErziBQZS9Eh'],
  ['Facebook', 'https://www.facebook.com/Godbite'],
] as const;
export const copy = {
  en: {
    listen: 'Listen', watch: 'Watch', contact: 'Contact', sound: 'Sound', on: 'On', off: 'Off',
    tagline: 'Dependent music / No alternative', forest: 'You wake in a white forest without windows.',
    follow: 'Follow the red light', latest: 'The latest transmission', play: 'Play film',
    threshold: 'The threshold', music: 'The ritual', cinema: 'The cinema', signal: 'The signal',
    musicTitle: 'Five offerings.', musicIntro: 'Something of us remains in every recording.',
    selectRelease: 'Choose a recording', album: 'Album', ep: 'EP', single: 'Single',
    listenOn: 'Listen on', close: 'Close', previous: 'Previous recording', next: 'Next recording',
    film: 'Official music video', visualiser: 'Official visualiser', chooseFilm: 'Choose a film',
    contactTitle: 'Let it in.', booking: 'Booking / Contact',
    bio: 'Five bodies. An appetite for ritual. Progressive rock and metal from Szczecin, Poland.',
    poem: 'The nets tangle the fingers that wove them.', credits: 'Credits',
    creditsTitle: 'Behind the signal', artwork: 'Cover artwork',
    creditsBody: 'Music, identity and original release artwork belong to Godbite and their credited collaborators. Mir: Artur Ciechorski. JISM and Social Media Girls: Trash Boat. A white forest built for Godbite.',
    external: 'Watch on YouTube', mute: 'Turn off ambient sound', unmute: 'Turn on ambient sound',
    pause: 'Pause motion', resume: 'Resume motion', skip: 'Skip to contact', language: 'Language', unavailable: 'Sound unavailable',
    loadingFilm: 'Opening the projection…', failedFilm: 'If the projection does not start, watch on YouTube.',
  },
  pl: {
    listen: 'Słuchaj', watch: 'Oglądaj', contact: 'Kontakt', sound: 'Dźwięk', on: 'Wł.', off: 'Wył.',
    tagline: 'Muzyka zależna / Brak alternatywy', forest: 'Budzisz się w białym lesie bez okien.',
    follow: 'Idź za czerwonym światłem', latest: 'Najnowsza transmisja', play: 'Odtwórz film',
    threshold: 'Próg', music: 'Rytuał', cinema: 'Kino', signal: 'Sygnał',
    musicTitle: 'Pięć ofiar.', musicIntro: 'Coś z nas zostaje w każdym nagraniu.',
    selectRelease: 'Wybierz nagranie', album: 'Album', ep: 'EP', single: 'Singiel',
    listenOn: 'Słuchaj na', close: 'Zamknij', previous: 'Poprzednie nagranie', next: 'Następne nagranie',
    film: 'Oficjalny teledysk', visualiser: 'Oficjalna wizualizacja', chooseFilm: 'Wybierz film',
    contactTitle: 'Wpuść nas.', booking: 'Booking / Kontakt',
    bio: 'Pięć osób. Potrzeba rytuału. Progresywny rock i metal ze Szczecina.',
    poem: 'Sieci plączą palce, którymi były utkane.', credits: 'Autorzy',
    creditsTitle: 'Za sygnałem', artwork: 'Okładka',
    creditsBody: 'Muzyka, tożsamość i oryginalne okładki wydawnictw należą do Godbite i wskazanych współtwórców. Mir: Artur Ciechorski. JISM i Social Media Girls: Trash Boat. Biały las zbudowany dla Godbite.',
    external: 'Oglądaj na YouTube', mute: 'Wyłącz dźwięk tła', unmute: 'Włącz dźwięk tła',
    pause: 'Zatrzymaj ruch', resume: 'Wznów ruch', skip: 'Przejdź do kontaktu', language: 'Język', unavailable: 'Dźwięk niedostępny',
    loadingFilm: 'Uruchamianie projekcji…', failedFilm: 'Jeśli projekcja się nie rozpocznie, oglądaj na YouTube.',
  },
} as const;
