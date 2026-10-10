export type Language = 'en' | 'pl';
export type Chapter = 'threshold' | 'music' | 'cinema' | 'contact';
export interface Release {
  id: string; title: string; year: number; kind: 'album' | 'ep' | 'single';
  cover: string; bandcamp: string; spotify?: string; artwork?: string;
}
export const tracklists: Record<string, readonly (readonly [string,string?])[]> = {
  'social-media-girls': [['Social Media Girls','08:21']],
  jism: [['DICK PUMP','07:27'],['SHIT MOUTH','06:45'],['CUM RAG','10:01']],
  mir: [["Walkin' Phoenix",'05:28'],['Toiler','06:14'],['Piecekeeper','08:20'],['The World Beneath the World','07:28'],['Impostor','05:27'],['Elbow Grease','05:01'],['Shibboleth','07:11'],['Pentecost','05:20'],['Tarrare 52','07:00']],
  'the-aristocrats': [['David Lynch','05:08'],['You Can Lead a Horse','04:28'],['Mothermeat','03:08'],['Camwhore','07:20'],['Bear in Mind','06:20'],['My Home Is Yours','07:00'],["Schrödinger's Scat",'05:29'],['Red Herring','02:00'],['Till the Cows Come Home','04:55']],
  horse: [['you can lead a horse'],['sedative'],['bear in mind']],
};
export interface Film {
  id: string; title: string; youtubeId: string; kind: 'video' | 'visualiser';
}
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const releases: Release[] = [
  { id: 'social-media-girls', title: 'Social Media Girls', year: 2026, kind: 'single', cover: 'social-media-girls', bandcamp: 'https://godbite.bandcamp.com/album/social-media-girls', spotify: 'https://open.spotify.com/album/4yji0Hoa0DhRDht4PMfB3z', artwork: 'Trash Boat' },
  { id: 'jism', title: 'JISM', year: 2025, kind: 'ep', cover: 'jism', bandcamp: 'https://godbite.bandcamp.com/album/jism', spotify: 'https://open.spotify.com/album/7nYGh0vFxKyXKLRSkCtpOz', artwork: 'Trash Boat' },
  { id: 'mir', title: 'Mir', year: 2023, kind: 'album', cover: 'mir', bandcamp: 'https://godbite.bandcamp.com/album/mir', spotify: 'https://open.spotify.com/album/4Rdud3cjsccagcNbBwBRhk', artwork: 'Artur Ciechorski' },
  { id: 'the-aristocrats', title: 'the Aristocrats', year: 2015, kind: 'album', cover: 'the-aristocrats', bandcamp: 'https://godbite.bandcamp.com/album/the-aristocrats', spotify: 'https://open.spotify.com/album/2bHyQF36UreAU70VC7mx3l' },
  { id: 'horse', title: 'You can lead a horse EP', year: 2011, kind: 'ep', cover: 'demo', bandcamp: 'https://godbite.bandcamp.com/album/demo', spotify: 'https://open.spotify.com/album/2dEzIU90xRp9QfZoYCWYD2' },
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
    listen: 'Listen', watch: 'Watch', contact: 'Contact', sound: 'Sound', on: 'On', off: 'Off', soundHint: 'Sound awakens with your first touch.',
    tagline: 'Dependent music / No alternative', forest: 'You wake in a white forest without windows.',
    follow: 'Follow the red light', latest: 'The latest transmission', play: 'Play film',
    threshold: 'The threshold', music: 'The ritual', cinema: 'The cinema', signal: 'The signal',
    musicTitle: 'Five offerings.', musicIntro: 'Something of us remains in every recording.',
    selectRelease: 'Choose a recording', album: 'Album', ep: 'EP', single: 'Single',
    listenOn: 'Listen on', close: 'Close', previous: 'Previous recording', next: 'Next recording',
    film: 'Official music video', visualiser: 'Official visualiser', chooseFilm: 'Choose a film', previousFilm: 'Previous film', nextFilm: 'Next film',
    contactTitle: 'Let it in.', booking: 'Booking / Contact',
    bio: 'Five bodies. An appetite for ritual. Progressive rock and metal from Szczecin, Poland.',
    poem: 'The nets tangle the fingers that wove them.', credits: 'Credits',
    creditsTitle: 'Behind the signal', artwork: 'Cover artwork',
    creditsManifesto: 'Godbite is a band of five coming together. Its members are ignited by a hunger for spectacle and guided by it. A need for ritual and plenty of strength at home. At the edge of patience, they endure under the weight. Moments of their lives join pleasure with pain. Hearts leave brains behind in the cinema while hands are already in paint a block away. Moving forward this way, they have nothing to reproach themselves for. The nets tangle the fingers that wove them.',
    creditsInvocation: '/// THE BURNING WOMAN /// You wake in a white forest without windows.',
    creditsBody: 'Music, identity and original release artwork belong to Godbite and their credited collaborators. Mir: Artur Ciechorski. JISM and Social Media Girls: Trash Boat. A white forest built for Godbite.',
    external: 'Watch on YouTube', mute: 'Turn off ambient sound', unmute: 'Turn on ambient sound',
    pause: 'Pause motion', resume: 'Resume motion', skip: 'Skip to contact', language: 'Language', unavailable: 'Sound unavailable', unavailableState: 'Unavailable',
    loadingFilm: 'Opening the projection…', failedFilm: 'If the projection does not start, watch on YouTube.',
  },
  pl: {
    listen: 'Słuchaj', watch: 'Oglądaj', contact: 'Kontakt', sound: 'Dźwięk', on: 'Wł.', off: 'Wył.', soundHint: 'Porusz myszką, przewiń lub dotknij, by obudzić dźwięk. Jeśli nadal jest cisza, kliknij lub naciśnij klawisz.',
    tagline: 'Muzyka zależna / Brak alternatywy', forest: 'Budzisz się w białym lesie bez okien.',
    follow: 'Idź za czerwonym światłem', latest: 'Najnowsza transmisja', play: 'Odtwórz film',
    threshold: 'Próg', music: 'Rytuał', cinema: 'Kino', signal: 'Sygnał',
    musicTitle: 'Pięć ofiar.', musicIntro: 'Coś z nas zostaje w każdym nagraniu.',
    selectRelease: 'Wybierz nagranie', album: 'Album', ep: 'EP', single: 'Singiel',
    listenOn: 'Słuchaj na', close: 'Zamknij', previous: 'Poprzednie nagranie', next: 'Następne nagranie',
    film: 'Oficjalny teledysk', visualiser: 'Oficjalna wizualizacja', chooseFilm: 'Wybierz film', previousFilm: 'Poprzedni film', nextFilm: 'Następny film',
    contactTitle: 'Wpuść nas.', booking: 'Booking / Kontakt',
    bio: 'Pięć osób. Potrzeba rytuału. Progresywny rock i metal ze Szczecina.',
    poem: 'Sieci plączą palce, którymi były utkane.', credits: 'Autorzy',
    creditsTitle: 'Za sygnałem', artwork: 'Okładka',
    creditsManifesto: 'Godbite to skład zespalający się z pięciu. Członków rozpala żądza spektaklu i kieruje nimi. Potrzeba rytuału i dużo siły w domu. I na granicy cierpliwości z ciężarem trwają w najlepsze. Momenty ich życia łączą rozkosz z bólem. Serca opuszczają mózgi w sali kinowej podczas gdy ręce już w farbie przecznicę dalej. Idąc w ten sposób naprzód nie mają sobie nic do zarzucenia. Sieci plączą palce, którymi były utkane',
    creditsInvocation: '/// PŁONĄCA KOBIETA /// Budzisz się w białym lesie bez okien.',
    creditsBody: 'Muzyka, tożsamość i oryginalne okładki wydawnictw należą do Godbite i wskazanych współtwórców. Mir: Artur Ciechorski. JISM i Social Media Girls: Trash Boat. Biały las zbudowany dla Godbite.',
    external: 'Oglądaj na YouTube', mute: 'Wyłącz dźwięk tła', unmute: 'Włącz dźwięk tła',
    pause: 'Zatrzymaj ruch', resume: 'Wznów ruch', skip: 'Przejdź do kontaktu', language: 'Język', unavailable: 'Dźwięk niedostępny', unavailableState: 'Niedostępny',
    loadingFilm: 'Uruchamianie projekcji…', failedFilm: 'Jeśli projekcja się nie rozpocznie, oglądaj na YouTube.',
  },
} as const;
