// The landing's hero set: twelve self-hosted Dubai photos (public/hero), each
// from Wikimedia Commons under CC0, CC BY or CC BY-SA, checked by hand. Every
// one is credited on /credits with its author and licence, which CC BY and
// BY-SA require. No generated imagery and nothing from Google.

export interface HeroPhoto {
  src: string;
  alt: string;
  /** "Author / Wikimedia Commons / Licence", as /credits shows it. */
  attribution: string;
  /** The Commons file page: author, licence and the original. */
  source: string;
}

export const HERO_PHOTOS: readonly HeroPhoto[] = [
  { src: "/hero/skyline-reflection.webp", alt: "Downtown Dubai's skyline and the Burj Khalifa reflected in the water at dusk", attribution: "Robert Bock / Wikimedia Commons / CC0", source: "https://commons.wikimedia.org/wiki/File:Dubai_skyline_unsplash.jpg" },
  { src: "/hero/marina-yachts-night.webp", alt: "Yachts moored under lit towers in Dubai Marina at night", attribution: "Iwona Rege / Wikimedia Commons / CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Dubai_Marina_Night_View_2.jpg" },
  { src: "/hero/marina-towers-night.webp", alt: "Dubai Marina's towers lit up at night", attribution: "Gfilip / Wikimedia Commons / CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Dubai_Marina_Towers_by_night.jpg" },
  { src: "/hero/skyline-sunrise-road.webp", alt: "The sun low behind the Burj Khalifa and the city skyline, seen from the road", attribution: "ECWiki1 / Wikimedia Commons / CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Burj_Khalifa_Dubai,_UAE_at_Sunset_001_by_Eric_Chamchoum.jpg" },
  { src: "/hero/city-from-burj.webp", alt: "Sunset over Dubai seen from high up the Burj Khalifa", attribution: "Simon Bierwald from Dortmund, Germany / Wikimedia Commons / CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Dubai_Sunset_from_Burj_Khalifa.jpg" },
  { src: "/hero/fountain-burj-sunset.webp", alt: "The Burj Khalifa and Downtown towers over the fountain lake at sunset", attribution: "Christian Raggini / Wikimedia Commons / CC0", source: "https://commons.wikimedia.org/wiki/File:The_Dubai_Fountain_%26_Burj_Khalifa_Pixabay.jpg" },
  { src: "/hero/desert-dunes.webp", alt: "Rolling sand dunes in the desert outside Dubai", attribution: "Gfilip / Wikimedia Commons / CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Dubai_desert_dunes.jpg" },
  { src: "/hero/desert-sunset.webp", alt: "The sun setting over low dunes and desert scrub", attribution: "iMahesh / Wikimedia Commons / CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Sunset_captured_on_Dubai_Dunes_(Wide_Angle).jpg" },
  { src: "/hero/desert-camel.webp", alt: "A camel grazing on open desert sand", attribution: "Rob Young from United Kingdom / Wikimedia Commons / CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Camel_in_the_Desert_(8668544166).jpg" },
  { src: "/hero/burj-al-arab-night.webp", alt: "The Burj Al Arab and Jumeirah Beach Hotel lit up at blue hour", attribution: "Yacine Hary / Wikimedia Commons / CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Burj_Al_Arab_and_Jumeirah_Beach_(9601659067).jpg" },
  { src: "/hero/beach-club-jbr.webp", alt: "A beach club's palm-lined entrance under the JBR towers at dusk", attribution: "Rob Young from United Kingdom / Wikimedia Commons / CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Meydan_Beach_Club,_Dubai_(8667414349).jpg" },
  { src: "/hero/brunch-table.webp", alt: "Brunch plates of crudo, sliders and salad on a wooden table", attribution: "Madaraizen20 / Wikimedia Commons / CC0", source: "https://commons.wikimedia.org/wiki/File:Brunch_Nikki_Beach_Resort_and_Spa_Dubai.jpg" },
];
