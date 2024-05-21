import {BasicObjectStore} from '$utils/stores/base';
import type {Readable} from 'svelte/store';
import type {RenderViewState} from './renderview';

export type CameraState = {
	x: number;
	y: number;
	width: number;
	height: number;
	zoom: number;
	renderX: number;
	renderY: number;
	renderWidth: number;
	renderHeight: number;
	renderScale: number;
	devicePixelRatio: number;
	pointerX: number;
	pointerY: number;
};

type RenderViewReadable = Readable<RenderViewState>;

export class Camera extends BasicObjectStore<CameraState> {
	private isPanning = false;
	private lastClientPos = {x: 0, y: 0};
	private firstClientPos = {x: 0, y: 0};
	private isZooming = false;
	private lastDist = 0;
	private zoomPoint = {x: 0, y: 0};

	public onClick: ((x: number, y: number) => void) | undefined;

	protected renderView: RenderViewReadable | undefined;
	protected surface: HTMLElement | undefined;

	private unsubscribeFromRenderView: (() => void) | undefined;

	// private static zoomLevels = [1000, 500, 200, 100, 50, 20, 10, 5, 4, 3, 2, 1, 0.5];

	private _onmousedown: (e: MouseEvent) => void = this.onmousedown.bind(this);
	private _onmousemove: (e: MouseEvent) => void = this.onmousemove.bind(this);
	private _onmouseup: (e: MouseEvent) => void = this.onmouseup.bind(this);

	private _ontouchstart: (e: TouchEvent) => void = this.ontouchstart.bind(this);
	private _ontouchmove: (e: TouchEvent) => void = this.ontouchmove.bind(this);
	private _ontouchend: (e: TouchEvent) => void = this.ontouchend.bind(this);

	private _onwheel: (e: WheelEvent) => void = this.onwheel.bind(this);
	constructor() {
		super();
	}

	get zoom(): number {
		return this.$store.zoom;
	}

	start(surface: HTMLElement, renderView: RenderViewReadable): void {
		this.surface = surface;
		this.renderView = renderView;

		if (!this.$store || this.$store.width == 0) {
			try {
				const data = localStorage.getItem('_camera');
				if (data) {
					const v = JSON.parse(data);
					this._set(v);
				}
			} catch {}
			if (!this.$store) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this._set({
					x: 0,
					y: 0,
					width: 0,
					height: 0,
					zoom: 0,
					renderX: 0,
					renderY: 0,
					renderWidth: 0,
					renderHeight: 0,
					renderScale: 0,
					devicePixelRatio: 1,
					pointerX: 0,
					pointerY: 0,
				});
				this._setXYZoom(0, 0, 32);
				// this._setXYZoom(0, 0, Camera.zoomLevels[this.zoomIndex]);
			}
		}

		this.unsubscribeFromRenderView = this.renderView.subscribe(this.onRenderViewUpdates.bind(this));

		this.surface.addEventListener('mousedown', this._onmousedown);
		this.surface.addEventListener('mouseup', this._onmouseup);
		this.surface.addEventListener('mousemove', this._onmousemove);

		this.surface.addEventListener('touchstart', this._ontouchstart);
		this.surface.addEventListener('touchend', this._ontouchend);
		this.surface.addEventListener('touchmove', this._ontouchmove);

		this.surface.addEventListener('wheel', this._onwheel);

		// DEBUGGING
		// document.onclick = (event) => {
		// 	console.log(JSON.stringify(this.$store, null, 1));
		// 	const {clientX, clientY} = event;
		// 	const offsetX = clientX - this.surface.clientLeft;
		// 	const offsetY = clientY - this.surface.clientTop;
		// 	const {x, y} = this.screenToWorld(offsetX, offsetY);
		// 	console.log(JSON.stringify({x, y, offsetX, offsetY, clientX, clientY}, null, 1));
		// };
	}

	stop(): void {
		if (this.unsubscribeFromRenderView) {
			this.unsubscribeFromRenderView();
			this.unsubscribeFromRenderView = undefined;
		}

		if (this.surface) {
			this.surface.removeEventListener('mousedown', this._onmousedown);
			this.surface.removeEventListener('mouseup', this._onmouseup);
			this.surface.removeEventListener('mousemove', this._onmousemove);

			this.surface.removeEventListener('touchstart', this._ontouchstart);
			this.surface.removeEventListener('touchend', this._ontouchend);
			this.surface.removeEventListener('touchmove', this._ontouchmove);

			this.surface.removeEventListener('wheel', this._onwheel);

			this.surface = undefined;
		}
	}

	_setXYZoom(x: number, y: number, zoom: number): void {
		this.$store.x = x;
		this.$store.y = y;
		this.$store.zoom = zoom;
		const scale = this.$store.zoom * this.$store.devicePixelRatio;
		this.$store.renderScale = scale;
		this.$store.width = this.$store.renderWidth / scale;
		this.$store.height = this.$store.renderHeight / scale;
		this.$store.renderX = this.$store.renderWidth / 2 - this.$store.x * scale;
		this.$store.renderY = this.$store.renderHeight / 2 - this.$store.y * scale;
		this._set(this.$store);

		(window as any).cameraState = this.$store;
		try {
			localStorage.setItem('_camera', JSON.stringify(this.$store));
		} catch {}
	}

	screenToWorld(x: number, y: number): {x: number; y: number} {
		const devicePixelRatio = this.$store.devicePixelRatio;
		const scale = this.$store.zoom * devicePixelRatio;
		x = (x * devicePixelRatio - this.$store.renderWidth / 2) / scale + this.$store.x;
		y = (y * devicePixelRatio - this.$store.renderHeight / 2) / scale + this.$store.y;
		return {
			x,
			y,
		};
	}

	worldToScreen(x: number, y: number): {x: number; y: number} {
		if (!this.$store) {
			// TODO store should always be set to something
			return {x: 0, y: 0};
		}
		const devicePixelRatio = this.$store.devicePixelRatio;
		const scale = this.$store.zoom * devicePixelRatio;
		return {
			x: ((x - this.$store.x) * scale + this.$store.renderWidth / 2) / devicePixelRatio,
			y: ((y - this.$store.y) * scale + this.$store.renderHeight / 2) / devicePixelRatio,
		};
	}

	_update(): void {
		this._setXYZoom(this.$store.x, this.$store.y, this.$store.zoom);
	}

	_onClick(x: number, y: number): void {
		const worldPos = this.screenToWorld(x, y);
		if (this.onClick) {
			this.onClick(worldPos.x, worldPos.y);
		}
	}

	onmousedown(e: TouchEvent | MouseEvent): void {
		// console.log({button: (e as MouseEvent).button});
		if ((e as MouseEvent).button === 2) {
			return;
		}
		// console.log('startPanning');
		this.isPanning = true;
		let eventX;
		let eventY;
		if ('clientX' in e) {
			// console.log('mouse');
			eventX = e.clientX;
			eventY = e.clientY;
		} else {
			// console.log('touch', e);
			eventX = e.touches[0].clientX;
			eventY = e.touches[0].clientY;
		}
		this.lastClientPos = {x: eventX, y: eventY};
		this.firstClientPos = {x: eventX, y: eventY};
	}

	onmouseup(e: TouchEvent | MouseEvent): void {
		// console.log('endPanning');
		this.isPanning = false;

		let eventX;
		let eventY;
		if ('clientX' in e) {
			// console.log('mouse');
			eventX = e.clientX;
			eventY = e.clientY;
		} else {
			// console.log('touch', e);
			eventX = e.changedTouches[0].clientX;
			eventY = e.changedTouches[0].clientY;
		}
		const dist = Math.hypot(eventX - this.firstClientPos.x, eventY - this.firstClientPos.y);
		if (dist < 22) {
			// TODO : devicePixelRatio?
			// TODO time too ?
			this._onClick(this.lastClientPos.x, this.lastClientPos.y);
		}
	}

	onmousemove(e: TouchEvent | MouseEvent): void {
		// let movementX;
		// let movementY;
		// if (e.movementX) {
		// 	movementX = e.movementX / windowDevicePxelRatio;
		// 	movementY = e.movementY / windowDevicePxelRatio;
		// }
		let eventX;
		let eventY;
		if ('clientX' in e) {
			eventX = e.clientX;
			eventY = e.clientY;
		} else {
			eventX = e.touches[0].clientX;
			eventY = e.touches[0].clientY;
		}

		const eventWorldCoords = this.screenToWorld(eventX, eventY);
		this.$store.pointerX = eventWorldCoords.x;
		this.$store.pointerY = eventWorldCoords.y;

		if (this.isPanning) {
			// console.log({eventX, eventY});
			const movementX = eventX - this.lastClientPos.x;
			const movementY = eventY - this.lastClientPos.y;
			// console.log(JSON.stringify({movementX, movementY, eMovementX: e.movementX, eMovementY: e.movementY}))
			this.lastClientPos = {x: eventX, y: eventY};

			// console.log('panning', movementX, movementY);

			const devicePixelRatio = this.$store.devicePixelRatio;
			const scale = this.$store.zoom * devicePixelRatio;
			const xDiff = -(movementX * devicePixelRatio) / scale;
			const yDiff = -(movementY * devicePixelRatio) / scale;
			this.$store.x += xDiff;
			this.$store.y += yDiff;

			this.$store.pointerX -= xDiff;
			this.$store.pointerY -= yDiff;
		}

		this._update();
	}

	navigate(x: number, y: number, zoom: number): void {
		const xDiff = x - this.$store.x;
		const yDiff = y - this.$store.y;
		this.$store.x = x;
		this.$store.y = y;
		this.$store.zoom = zoom;

		this.$store.pointerX -= xDiff;
		this.$store.pointerY -= yDiff;
		this._update();
	}

	onwheel(e: WheelEvent): void {
		e.preventDefault();
		if (!this.surface) {
			throw new Error(`no surface`);
		}
		const {clientX, clientY, deltaY, offsetX, offsetY} = e;
		// console.log({clientX, clientY, deltaY, pageX: e.pageX, pageY: e.pageY, offsetX: e.offsetX, offsetY: e.offsetY});
		// // const offsetX = clientX - this.surface.clientLeft;
		// // const offsetY = clientY - this.surface.clientTop;
		const dir = (Math.abs(deltaY) / deltaY) as 0 | -1 | 1;

		// DEBUGGING
		// const {x, y} = this.screenToWorld(offsetX, offsetY);
		// console.log(JSON.stringify({clientX, clientY, offsetX, offsetY, dir, deltaY, x, y}, null, 2));

		this.updateZoom(offsetX, offsetY, dir);
	}

	startZooming(e: TouchEvent): void {
		this.isPanning = false; // zooming override panning
		this.isZooming = true;
		this.lastDist = Math.hypot(
			e.touches[0].clientX - e.touches[1].clientX,
			e.touches[0].clientY - e.touches[1].clientY,
		);
		this.zoomPoint = {
			x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
			y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	endZooming(_e: TouchEvent): void {
		this.isZooming = false;
	}

	doZooming(e: TouchEvent): void {
		const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

		// console.log(JSON.stringify({dist, lastDist}));
		const diff = this.lastDist - dist;
		if (Math.abs(diff) > 50) {
			// devicePixelRatio
			const dir: 0 | -1 | 1 = Math.sign(diff) as 0 | -1 | 1;
			this.updateZoom(this.zoomPoint.x, this.zoomPoint.y, dir);
			this.lastDist = dist;
		}
	}

	logTouchEvent(_title: string, e: TouchEvent): void {
		const touches = [];
		for (let i = 0; i < e.touches.length; i++) {
			touches.push({identifier: e.touches[i].identifier});
		}
		// console.log(_title, JSON.stringify(touches));
	}

	ontouchstart(e: TouchEvent): void {
		e.preventDefault();
		this.logTouchEvent('start', e);
		if (!this.isZooming && e.touches.length === 2) {
			this.startZooming(e);
		} else if (!this.isZooming) {
			this.onmousedown(e); // TODO ?
		}
	}

	ontouchend(e: TouchEvent): void {
		e.preventDefault();
		this.logTouchEvent('end', e);
		if (this.isZooming) {
			this.endZooming(e);
		} else if (this.isPanning) {
			this.onmouseup(e); // TODO ?
		}
	}

	ontouchmove(e: TouchEvent): void {
		e.preventDefault();
		this.logTouchEvent('move', e);
		if (this.isZooming) {
			if (e.touches.length != 2) {
				this.endZooming(e);
			} else {
				this.doZooming(e);
			} // TODO allow panning if one touch left?
		} else if (this.isPanning) {
			this.onmousemove(e); // TODO ?
		}
	}

	// function clientToCanvas(x: number, y: number) {
	//   const devicePixelRatio = this.render.devicePixelRatio;
	//   x = x * devicePixelRatio;
	//   y = y * devicePixelRatio;
	//   return {
	//     x,
	//     y,
	//   };
	// }

	updateZoom(offsetX: number, offsetY: number, dir: 1 | -1 | 0): void {
		const {x, y} = this.screenToWorld(offsetX, offsetY);

		const maxSize = 500 * 500; //700 * 700; was too big
		const minSize = 1 * 1;

		const size = this.$store.width * this.$store.height;
		const renderSize = this.$store.renderWidth * this.$store.renderHeight;
		let newSize = size;
		if (dir > 0) {
			newSize = size + size / 5; // + 20%
			if (newSize > maxSize) {
				if (maxSize / size > 1.1) {
					newSize = maxSize;
				} else {
					return;
				}
			}
		} else {
			newSize = size - size / 5; // - 20%
			if (newSize < minSize) {
				if (minSize / size < 0.9) {
					newSize = minSize;
				} else {
					return;
				}
			}
		}
		const scale = Math.sqrt(renderSize) / Math.sqrt(newSize);
		this.$store.zoom = scale / this.$store.devicePixelRatio;

		// if (dir > 0) {
		//   const size = this.$store.width * this.$store.height;
		//   const renderSize = this.$store.renderWidth * this.$store.renderHeight;
		//   let newSize = size + size / 5; // + 20%
		//   if (newSize > maxSize) {
		//     if ((maxSize) / size > 1.1) {
		//       newSize = maxSize;
		//     } else {
		//       return;
		//     }
		//   }
		//   const scale = Math.sqrt(renderSize) / Math.sqrt(newSize);
		//   this.$store.zoom = scale / this.$store.devicePixelRatio;
		//   // let size = this.$store.width;
		//   // let renderSize = this.$store.renderWidth;
		//   // if (this.$store.height > size) {
		//   //   size = this.$store.height;
		//   //   renderSize = this.$store.renderHeight;
		//   // }
		//   // let newSize = size + size / 5; // + 20%
		//   // if (newSize > 1000) {
		//   //   if (1000 / size > 1.1) {
		//   //     newSize = 1000;
		//   //   } else {
		//   //     return;
		//   //   }
		//   // }
		//   // const scale = renderSize / newSize;
		//   // this.$store.zoom = scale / this.$store.devicePixelRatio;
		// } else {
		//   let size = this.$store.width;
		//   let renderSize = this.$store.renderWidth;
		//   if (this.$store.height < size) {
		//     size = this.$store.height;
		//     renderSize = this.$store.renderHeight;
		//   }
		//   let newSize = size - size / 5; // - 20%
		//   if (newSize < 9) {
		//     if (9 / size < 0.9) {
		//       newSize = 9;
		//     } else {
		//       return;
		//     }
		//   }
		//   const scale = renderSize / newSize;
		//   this.$store.zoom = scale / this.$store.devicePixelRatio;
		// }

		const screenPos = this.worldToScreen(x, y);
		const delta = {
			x: (offsetX - screenPos.x) / this.$store.zoom,
			y: (offsetY - screenPos.y) / this.$store.zoom,
		};

		// console.log({screenPosX: screenPos.x, screenPosY: screenPos.y, deltaX: delta.x, deltaY: delta.y});

		this.$store.x -= delta.x;
		this.$store.y -= delta.y;
		this._update();
	}

	onRenderViewUpdates(renderView: {width: number; height: number; devicePixelRatio: number}): void {
		this.$store.renderWidth = renderView.width;
		this.$store.renderHeight = renderView.height;
		this.$store.devicePixelRatio = renderView.devicePixelRatio;

		this._update();
	}
}

export const camera = new Camera();
