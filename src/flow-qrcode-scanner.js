import {BaseElement, html, css, baseUrl} from './base-element.js';
import { dpc, contain} from './helpers.js';
import {jsQR} from '../resources/extern/jsQR/jsQR.js';
//console.log("jsQR", jsQR)

export class FlowQRCodeScanner extends BaseElement {
	static get properties() {
		return {
			cameras:{type:Array},
			selectedCamera:{type:Object},
			qrCode:{type:String},
			errorMessage:{type:String}
		}
	}

	static get styles() {
		return css`
			:host {
				display : block;
				min-width: 100px;
				min-height: 100px;
				/*max-width: 400px;*/
				overflow:auto;
				margin:auto;
				position:relative;
				max-height:80vh;
			}
			.error{
				font-size:var(--flow-qrscanner-error-font-size, 0.8rem);
				color:var(--flow-qrscanner-error-color, #F00);
				padding:var(--flow-qrscanner-error-padding, 10px);
			}
			.wait-msg, .select-msg{
				font-size:var(--flow-qrscanner-msg-font-size, 1rem);
			}
			.video{border:0px solid #000000;display:none;}
			.view{
				border:1px solid #000000;display:block;margin:5px auto;
				width:var(--flow-qrscanner-canvas-width, 200px);
				height:var(--flow-qrscanner-canvas-height, 200px);
				object-fit:contain;
			}
			.render-canvas{
				position:absolute;border:0px solid #000;display:none
			}
			.code{
				border:0px;-webkit-appearance:none;outline:none;
				margin:var(--flow-qrscanner-code-margin, 10px);
				overflow:hidden;text-overflow:ellipsis;
				font-size:var(--flow-qrscanner-code-font-size, 1rem);
				background-color:transparent;color:var(--flow-primary-color);
				font-family:var(--flow-qrscanner-code-font-family, "Exo 2");
				word-wrap:break-word;
				max-width:100%;
				width:var(--flow-qrscanner-code-width, 300px);
				height:var(--flow-qrscanner-code-height, auto);
				/*max-height:var(--flow-qrscanner-code-max-height, 100px);*/
				resize:none;
				display:block;
			}
			.logs{width:90%;height:100px;}
			:host(:not([logs])) .logs{display:none} 
		`;
	}

	constructor() {
		super();
	}

	render() {
		let {cameras=[], selectedCamera='', qrCode='', errorMessage=''} = this;
		return html`
			<textarea class="logs"></textarea>
			<div class="error">${errorMessage}</div>
			${this.renderCameraSelection()}
			${this.renderScanning()}
			${this.renderCode()}
		`;
	}

	renderCameraSelection(){
		const {cameras, selectedCamera, discoveryCamera} = this;
		if(discoveryCamera === false)
			return '';
		if(!cameras)
			return html`<div class="wait-msg">Please wait. Getting cameras.</div>`;
		//if(selectedCamera)
		//	return html`<div>Selected cameras: ${selectedCamera.label}</div>`

		let selected = selectedCamera?.id||'';
		return html`
		<div class="select-msg">Please select cameras</div>
		<flow-menu @select="${this.onCameraSelect}" selected="${selected}">
		${cameras.map(c=>{
			return html`<flow-menu-item
				value="${c.id}">${c.label}</flow-menu-item>`
		})}
		</flow-menu>
		`
	}
	renderScanning(){
		//let {selectedCamera} = this;
		//if(!selectedCamera)
		//	return ''

		return html`
			<video class="video" width="320" height="240" autoplay></video>
			<img class="view">
			<canvas class="render-canvas"></canvas>
		`
	}

	renderCode(){
		let {qrCode} = this;
		if(!qrCode)
			return '';
		return html`
			<div>QRCODE:</div>
			<div class="code">${qrCode}</div>
			<flow-btn @click="${this.clearCode}">Clear</flow-btn>
		`;
	}
	clearCode(){
		this.setQRCode("");
	}
	setQRCode(qrCode){
		this.qrCode = qrCode;
		this.fire("changed", {code: qrCode})
	}

	firstUpdated(){
		super.firstUpdated();
		this.viewImg = this.renderRoot.querySelector(".view");
		this.init();
	}
	updated(){
		super.updated();
		this.initScanning();
	}
	_log(title, data){
		let input = this.renderRoot.querySelector(".logs");
		input.value += `\n--------------\n${title}\n`+JSON.stringify(data)
	}
	initScanning(){
		if(this.qrCode)
			return
		let canvas = this.renderRoot.querySelector(".render-canvas");
		let video = this.renderRoot.querySelector(".video")
		let {selectedCamera} = this;
		this._log("initScanning", {canvas:!!canvas, video:!!video, selectedCamera, scanning:this.scanning})
		if(!canvas || !video || !selectedCamera)
			return

		if(this.scanning == selectedCamera.id)
			return
		if(video.srcObject){
			this.closeActiveStreams(video.srcObject)
		}
		this.scanning = selectedCamera.id;
		this.video = video;

		const canvasCtx = canvas.getContext('2d');
		//const desiredWidth = 1280;
		//const desiredHeight = 720;

		const constraints = {
			audio: false,
			video:{deviceId: { exact: selectedCamera.id }}
			/*,
			video: {
				// the browser will try to honor this resolution,
				// but it may end up being lower.
				width: desiredWidth,
				height: desiredHeight
			}*/
		};

		// open the webcam stream
		navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
			video.srcObject = stream;
			const track = stream.getVideoTracks()[0];
			const trackInfo = track.getSettings();
			let {width, height} = trackInfo;
			// required to tell iOS safari we don't want fullscreen
			video.setAttribute("playsinline", true);
			video.play();
			requestAnimationFrame(()=>{
				this.videoTick({
					video, trackInfo:{width, height}, canvas, canvasCtx,
					cameraId : selectedCamera.id
				})
			});

		}).catch((e) => {
			throw e
		});
	}

	setError(error){
		this.errorMessage = error;
	}

	async init(){
		try{
			let cameras = await this.getCameras();
			this.cameras = cameras;
			this.log("cameras", cameras)
		}catch(e){
			console.log("getCameras:error", e)
			this.setError(html`Camera discovery process failed.
				<br />Make sure you have given Camera permission.`)
			this.discoveryCamera = false
		}
	}
	closeActiveStreams(stream){
		const tracks = stream.getVideoTracks();
		for (var i = 0; i < tracks.length; i++) {
			const track = tracks[i];
			track.enabled = false;
			track.stop();
			stream.removeTrack(track);
		}
	}

	getCameras() {
		return new Promise((resolve, reject) => {
			if (navigator.mediaDevices
				&& navigator.mediaDevices.enumerateDevices
				&& navigator.mediaDevices.getUserMedia) {
				this.log("navigator.mediaDevices used");
				navigator.mediaDevices.getUserMedia({ audio: false, video: true })
				.then(stream => {
					// hacky approach to close any active stream if they are
					// active.
					stream.oninactive
						= _ => this.log("All streams closed");

					navigator.mediaDevices.enumerateDevices()
						.then(devices => {
							const results = [];
							for (var i = 0; i < devices.length; i++) {
								const device = devices[i];
								if (device.kind == "videoinput") {
									results.push({
										id: device.deviceId,
										label: device.label
									});
								}
							}
							this.log(`${results.length} results found`);
							this.closeActiveStreams(stream);
							resolve(results);
						})
						.catch(err => {
							reject(`${err.name} : ${err.message}`);
						});
				})
				.catch(err => {
					reject(`${err.name} : ${err.message}`);
				})
			} else if (MediaStreamTrack && MediaStreamTrack.getSources) {
				this.log("MediaStreamTrack.getSources used");
				const callback = sourceInfos => {
					const results = [];
					for (var i = 0; i !== sourceInfos.length; ++i) {
						const sourceInfo = sourceInfos[i];
						if (sourceInfo.kind === 'video') {
							results.push({
								id: sourceInfo.id,
								label: sourceInfo.label
							});
						}
					}
					this.log(`${results.length} results found`);
					resolve(results);
				}
				MediaStreamTrack.getSources(callback);
			} else {
				this.log("unable to query supported devices.");
				reject("unable to query supported devices.");
			}
		});
	}

	stopScanning(){
		let {video} = this;
		this._log("stopScanning", 'video_srcObject:'+(!!video?.srcObject))
		if(video?.srcObject){
			this.closeActiveStreams(video.srcObject)
			video.srcObject = null;
		}
		this.scanning = false;
	}

	videoTick({video, trackInfo, canvasCtx, canvas, cameraId}) {
		if(cameraId != this.selectedCamera?.id)
			return
		let next = ()=>{
			if(this.qrCode){
				this.stopScanning()
				return
			}
			requestAnimationFrame(()=>{
				this.videoTick({video, trackInfo, canvas, canvasCtx, cameraId})
			});
		}


		//loadingMessage.innerText = "⌛ Loading video..."
		if (video.readyState !== video.HAVE_ENOUGH_DATA)
			return next();

		const drawLine = (ctx, begin, end, color="#FF3B58")=>{
			ctx.beginPath();
			ctx.moveTo(begin.x, begin.y);
			ctx.lineTo(end.x, end.y);
			ctx.lineWidth = 4;
			ctx.strokeStyle = color;
			ctx.stroke();
		}

		//console.log(actualSettings.width, actualSettings.height)
		canvas.width = trackInfo.width;//200;//actualSettings.width;
		canvas.height = trackInfo.height;//200;//actualSettings.height;

		const { 
			offsetX, offsetY, width, height
		} = contain(canvas.width, canvas.height, trackInfo.width, trackInfo.height);

		canvasCtx.drawImage(video, offsetX, offsetY, width, height);
		let imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);

		let code = jsQR(imageData.data, imageData.width, imageData.height, {
			inversionAttempts: "dontInvert",
		});

		if (code) {
			let loc = code.location;
			drawLine(canvasCtx, loc.topLeftCorner, loc.topRightCorner);
			drawLine(canvasCtx, loc.topRightCorner, loc.bottomRightCorner);
			drawLine(canvasCtx, loc.bottomRightCorner, loc.bottomLeftCorner);
			drawLine(canvasCtx, loc.bottomLeftCorner, loc.topLeftCorner);
			this.setQRCode(code.data);
		}

		this.viewImg.src = canvas.toDataURL("image/jpeg");

		next();
		
	}

	onCameraSelect(e){
		let {selected} = e.detail;
		console.log("selected", selected)
		this.selectedCamera = this.cameras.find(c=>c.id == selected);
	}

}

FlowQRCodeScanner.define('flow-qrcode-scanner')/*, [
	/*
	baseUrl+'resources/extern/html5-qrcode/lazar-soft-scanner.js',
	baseUrl+'resources/extern/html5-qrcode/html5-qrcode-scanner.js',
	baseUrl+'resources/extern/html5-qrcode/html5-qrcode.js'
	* /
]);*/