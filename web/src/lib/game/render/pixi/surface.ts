/**
 * How the pixi host sets up its surface, for pixel art or for smooth art.
 *
 * Pixel art is the default because the reference game draws it: one backing
 * pixel per CSS pixel (the device resolution would upscale the sprites and
 * blur what is meant to be crisp), no antialiasing, positions rounded to the
 * pixel. A game whose art is smooth (gradients, rings, marks a few pixels wide)
 * asks for `smooth` instead, and gets the device ratio, antialiasing and
 * unrounded positions.
 *
 * TEXTURE FILTERING IS NOT HERE. `assets.ts` sets `nearest` as the default for
 * every texture, at import, because the sprite bundle is pixel art; a smooth
 * game sets `linear` on the textures it makes (`texture.source.scaleMode`),
 * which is one line where the texture is made rather than a second global
 * this host would have to own.
 *
 * NEVER `autoDensity`. The host sizes the canvas with CSS (`width: 100%`) and
 * passes `resizeTo: canvas`, and with `autoDensity` pixi writes the canvas's
 * CSS size and then measures it, which locks it at pixi's default 800 by 600.
 * Measured in stratagems' step 9 (its plan, item 1).
 */
export type SurfaceOptions = {
	resolution: number;
	antialias: boolean;
	roundPixels: boolean;
	/** The canvas's CSS `image-rendering`, for when the browser scales it. */
	imageRendering: 'pixelated' | 'auto';
};

export function surfaceOptions(params: {
	smooth: boolean;
	devicePixelRatio: number;
}): SurfaceOptions {
	if (!params.smooth) {
		return {
			resolution: 1,
			antialias: false,
			roundPixels: true,
			imageRendering: 'pixelated',
		};
	}
	return {
		resolution: params.devicePixelRatio > 0 ? params.devicePixelRatio : 1,
		antialias: true,
		roundPixels: false,
		imageRendering: 'auto',
	};
}
