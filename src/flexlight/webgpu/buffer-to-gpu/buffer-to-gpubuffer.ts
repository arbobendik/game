"use strict";

import { TypedArray } from "../../common/buffer/typed-array-view";
import { BufferToGPU } from "../../common/buffer/buffer-to-gpu";
import { BufferManager } from "../../common/buffer/buffer-manager";

export class BufferToGPUBuffer<T extends TypedArray> extends BufferToGPU {
    protected bufferManager: BufferManager<T>;
    readonly MIN_BUFFER_LENGTH: number;

    private _gpuBuffer: GPUBuffer;
    get gpuResource() { return this._gpuBuffer; }

    private size: number;
    private device: GPUDevice;
    
    private label: string;

    constructor(bufferManager: BufferManager<T>, device: GPUDevice, label: string = "") {
        super();

        this.MIN_BUFFER_LENGTH = 8 * bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Save device for future use
        this.device = device;
        // Save buffer manager for future use
        this.bufferManager = bufferManager;
        // Save label for reference
        this.label = label;
        // Bind GPUBuffer to BufferManager
        bufferManager.bindGPUBuffer(this);
        // Create GPUBuffer
        this.size = Math.max(bufferManager.length, this.MIN_BUFFER_LENGTH);
        this._gpuBuffer = device.createBuffer({
            size: this.size * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT, 
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: label
        });
        // console.log(label, this.length, "" + this.bufferManager.bufferView);
        // Copy data from buffer manager to GPUBuffer
        device.queue.writeBuffer(this._gpuBuffer, 0, this.bufferManager.bufferView);
    }

    // Reconstruct GPUBuffer from BufferManager, necessary if BufferManager is resized
    reconstruct = () => {
        // Get new byte length
        const newSize = Math.max(this.bufferManager.length, this.MIN_BUFFER_LENGTH);
        const newByteLength = newSize * this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Destroy old GPUBuffer if new byte length is greater than current byte length
        if (this.size !== newSize) {
            this.size = newSize;
            // console.log(this.label, this.bufferManager.length, this.length, "" + this.bufferManager.bufferView);
            // Destroy old GPUBuffer
            this._gpuBuffer.destroy();
            // Create GPUBuffer
            this._gpuBuffer = this.device.createBuffer({
                size: newByteLength, 
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: this.label
            });
        }
        // Copy data from buffer manager to GPUBuffer
        this.device.queue.writeBuffer(this._gpuBuffer, 0, this.bufferManager.bufferView);
    }

    // Update GPUBuffer partially or fully from BufferManager if data has changed
    update = (byteOffset: number = 0, length: number = this.bufferManager.length) => {
        const elementOffset = byteOffset / this.bufferManager.viewConstructor.prototype.BYTES_PER_ELEMENT;
        this.device.queue.writeBuffer(this._gpuBuffer, byteOffset, this.bufferManager.bufferView, elementOffset, length);
    }

    destroy = () => {
        // Destroy GPUBuffer
        this._gpuBuffer.destroy();
        // Release GPUBuffer from BufferManager
        this.bufferManager.releaseGPUBuffer();
    }
}