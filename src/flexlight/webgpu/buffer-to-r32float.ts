"use strict";

import { Constructor } from "../common/buffer/typed-array-view";
import { BufferToGPU } from "../common/buffer/buffer-to-gpu";
import { BufferManager } from "../common/buffer/buffer-manager";
import { Vector } from "../common/lib/math";


export type TypedArrayForTexture = Float32Array | Uint32Array | Int32Array | Uint16Array | Int16Array | Int8Array | Uint8Array;
const TEXTURE_SIZE_2D: Vector<2> = new Vector(2048, 2048);


export class BufferToR32Float extends BufferToGPU {
    protected bufferManager: BufferManager<Float32Array>;
    
    private BYTES_PER_ELEMENT: number = Float32Array.prototype.BYTES_PER_ELEMENT;
    private gpuTextureSize: Vector<3>;
    private _gpuTexture: GPUTexture;
    get gpuResource() { return this._gpuTexture.createView({ dimension: "2d-array", arrayLayerCount: this.gpuTextureSize.z }); }
    
    private device: GPUDevice;
    private label: string;

    constructor(bufferManager: BufferManager<Float32Array>, device: GPUDevice, label: string = "") {
        super();
        // Save device for future use
        this.device = device;
        // Save buffer manager for future use
        this.bufferManager = bufferManager;
        // Save label for reference
        this.label = label;
        // Bind GPUBuffer to BufferManager
        bufferManager.bindGPUBuffer(this);

        // Update gpuTextureSize
        this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
        console.log(this.gpuTextureSize + "");
        // Create GPUBuffer
        this._gpuTexture = this.device.createTexture({
            // dimension: "3d",
            size: this.gpuTextureSize,
            format: "r32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
        });

        const bytesPerRow = this.gpuTextureSize.x * this.BYTES_PER_ELEMENT;
        const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
        const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
        const fullView = new Float32Array(arrayBuffer, 0, arrayBuffer.byteLength / this.BYTES_PER_ELEMENT);

        console.log("R32Float bytesPerLayer", bytesPerLayer);

        fullView.set(this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        if (bufferManager.bufferView.length > 0) console.log(label, fullView);
        
        device.queue.writeTexture(
            { texture: this._gpuTexture, aspect: "all" },
            fullView, { bytesPerRow },
            { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
        );
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        console.log("RECONSTRUCT R32FLOAT");
        // Only reconstruct if gpuTexture needs to be recreated
        if (this.gpuTextureSize.x * this.gpuTextureSize.y * this.gpuTextureSize.z < this.bufferManager.length) {
            // Destroy old GPUTexture
            this._gpuTexture.destroy();
            // Update gpuTextureSize
            this.gpuTextureSize = new Vector(TEXTURE_SIZE_2D.x, TEXTURE_SIZE_2D.y, Math.max(1, Math.ceil(this.bufferManager.length / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y))));
            // Rereate GPUTexture
            this._gpuTexture = this.device.createTexture({
                // dimension: "3d",
                size: this.gpuTextureSize,
                format: "r32float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST
            });

            const bytesPerRow = this.gpuTextureSize.x * this.BYTES_PER_ELEMENT;
            const bytesPerLayer = bytesPerRow * this.gpuTextureSize.y;
            const arrayBuffer = new ArrayBuffer(bytesPerLayer * this.gpuTextureSize.z);
            const fullView = new Float32Array(arrayBuffer, 0, arrayBuffer.byteLength / this.BYTES_PER_ELEMENT);
            
            fullView.set(this.bufferManager.bufferView);
            // Copy data from buffer manager to GPUBuffer
            this.device.queue.writeTexture(
                { texture: this._gpuTexture, aspect: "all" },
                fullView, { bytesPerRow },
                { width: this.gpuTextureSize.x, height: this.gpuTextureSize.y, depthOrArrayLayers: this.gpuTextureSize.z }
            );
        }
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {
        console.log("UPDATE R32FLOAT");

        const firstAffectedLayer = Math.floor(byteOffset / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT));
        const firstAffectedLayerByteOffset = firstAffectedLayer * TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT;
        const lastAffectedLayer = Math.floor((byteOffset + length) / (TEXTURE_SIZE_2D.x * TEXTURE_SIZE_2D.y * this.BYTES_PER_ELEMENT));
        const layerLength = lastAffectedLayer - firstAffectedLayer + 1;
        // Copy data from buffer manager to GPUBuffer
        this.device.queue.writeTexture(
            { texture: this._gpuTexture, origin: { x: 0, y: 0, z: firstAffectedLayer }},
            this.bufferManager.bufferView, 
            { offset: firstAffectedLayerByteOffset },
            { width: TEXTURE_SIZE_2D.x, height: TEXTURE_SIZE_2D.y, depthOrArrayLayers: layerLength }
        );
    }

    destroy = () => {
        // Destroy GPUBuffer
        this._gpuTexture.destroy();
        // Release GPUBuffer from BufferManager
        this.bufferManager.releaseGPUBuffer();
    }
}