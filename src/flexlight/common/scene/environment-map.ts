"use strict";

import { BufferToGPU } from "../buffer/buffer-to-gpu";
import { Vector } from "../lib/math";



export class EnvironmentMap {
    cubeSideImages: Array<HTMLImageElement>;
    cubeSideSize: Vector<2>;

    constructor(cubeSideImages: Array<HTMLImageElement> = []) {
        if (cubeSideImages.length !== 6 && cubeSideImages.length !== 0) {
            throw new Error("EnvironmentMap.constructor(): cubeSideImages must be an array of 6 HTMLImageElement");
        }

        this.cubeSideImages = cubeSideImages;
        let firstImage = cubeSideImages[0];
        if (firstImage) {
            this.cubeSideSize = new Vector(firstImage.width, firstImage.height);
        } else {
            this.cubeSideSize = new Vector(1, 1);
        }
    }
}

export class EnvironmentMapManager {
    private _environmentMap: EnvironmentMap; 
    private _gpuBuffer: BufferToGPU | undefined = undefined;

    get environmentMap () { return this._environmentMap; }
    set environmentMap (environmentMap: EnvironmentMap) { 
        this._environmentMap = environmentMap;
    }

    constructor(environmentMap: EnvironmentMap | undefined = undefined) {
        this._environmentMap = environmentMap ?? new EnvironmentMap();
    }

    bindGPUBuffer(gpuBuffer: BufferToGPU) {
        if (this._gpuBuffer) {
            throw new Error("EnvironmentMapManager.bindGPUBuffer(): GPUBuffer already bound");
        }
        this._gpuBuffer = gpuBuffer;
    }

    releaseGPUBuffer() {
        this._gpuBuffer = undefined;
    }
}