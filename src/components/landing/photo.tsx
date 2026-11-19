/** A greyscale picture of Barrancabermeja in `public/images/`. Each one has AVIF and JPEG files in these widths. */
export interface PhotoSource {
  name: string;
  widths: readonly number[];
  /** The size of the largest file. The browser uses it to keep the space before the picture loads. */
  width: number;
  height: number;
}

export const AVENIDA: PhotoSource = {
  name: "avenida-del-ferrocarril",
  widths: [480, 720, 960, 1440],
  width: 1440,
  height: 1799,
};

export const CRISTO: PhotoSource = {
  name: "cristo-petrolero",
  widths: [480, 720, 960, 1440],
  width: 1440,
  height: 1800,
};

export const REFINERIA: PhotoSource = {
  name: "refineria-rio-magdalena",
  widths: [800, 1280, 1920, 2880],
  width: 2880,
  height: 1235,
};

export const PUENTE: PhotoSource = {
  name: "puente-rio-magdalena",
  widths: [640, 960, 1280, 1600],
  width: 1600,
  height: 996,
};

const srcSet = (photo: PhotoSource, extension: "avif" | "jpg") =>
  photo.widths
    .map((width) => `/images/${photo.name}-${width}.${extension} ${width}w`)
    .join(", ");

interface PhotoProps {
  photo: PhotoSource;
  alt: string;
  /** The width of the slot at each screen width, in the `sizes` syntax. */
  sizes: string;
}

/**
 * The largest paint of the first screen is the headline, not a picture.
 * So each picture loads when it comes near the screen, and no picture has a high fetch priority.
 */
export const Photo = ({ photo, alt, sizes }: PhotoProps) => (
  <picture>
    <source sizes={sizes} srcSet={srcSet(photo, "avif")} type="image/avif" />
    <img
      alt={alt}
      decoding="async"
      height={photo.height}
      loading="lazy"
      sizes={sizes}
      src={`/images/${photo.name}-${photo.widths.at(-1)}.jpg`}
      srcSet={srcSet(photo, "jpg")}
      width={photo.width}
    />
  </picture>
);
