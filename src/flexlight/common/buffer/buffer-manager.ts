"use strict";

import { TypedArray, Constructor, TypedArrayView } from "./typed-array-view";
import { next_power_of_two } from "../lib/math";
import { BufferToGPU } from "./buffer-to-gpu";

// All @ts-expect-error in this class are used due to typescript not supporting ArrayBuffer.resize() and ArrayBuffer.maxByteLength yet.
// For reference, see: 
//  maxByteLength:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/maxByteLength
//  resize:         https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/resize

export class BufferManager<T extends TypedArray> {
    private _buffer: ArrayBuffer = new ArrayBuffer(0);
    get buffer(): ArrayBuffer { return this._buffer; }

    private _length: number = 0;
    get length(): number { return this._length; }
    get byteLength(): number { return this._length * this._viewConstructor.prototype.BYTES_PER_ELEMENT; }
    // TypedArrayConstructor for the buffer
    private _viewConstructor: Constructor<T>;
    get viewConstructor(): Constructor<T> { return this._viewConstructor; }
    // Keeps track of all ArrayViews
    private instances: Set<TypedArrayView<T>> = new Set();
    // GPUBufferManager for this buffer
    private _gpuBuffer: BufferToGPU | undefined = undefined;
    get gpuBufferManager(): BufferToGPU | undefined { return this._gpuBuffer; }

    constructor(viewConstructor: Constructor<T>) {
        this._viewConstructor = viewConstructor;
    }

    // Create a view of whole buffer
    get bufferView(): T {
        return new this._viewConstructor(this._buffer, 0, this._length);
    }

    private resizeBuffer(byteLength: number) {
        // Update buffer length
        this._length = byteLength / this._viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Test if buffer can be resized or needs to be recreated
        const newBufferMaxByteLength = next_power_of_two(byteLength);
        if (newBufferMaxByteLength > this._buffer.byteLength) {
            // Recreate buffer if maxByteLength is exceeded
            const oldBuffer = this._buffer;
            this._buffer = new ArrayBuffer(newBufferMaxByteLength);
            // Copy data over to new buffer
            new Uint8Array(this._buffer).set(new Uint8Array(oldBuffer));
            // Reconstruct GPUBuffer if it exists due to resize
            if (this._gpuBuffer) this._gpuBuffer.reconstruct();
            // Reconstruct all views
            for (let instance of this.instances) {
                instance.swapBuffer(this._buffer);
            }
        }
    }

    allocateArray (array: T | Array<number>): TypedArrayView<T> {
        const BYTES_PER_ELEMENT = this._viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Get array attributes
        const arrayLength: number = array.length;
        const arrayByteLength: number = arrayLength * BYTES_PER_ELEMENT;

        // New offset is old buffer byte length
        const arrayByteOffset: number = this.length * BYTES_PER_ELEMENT;
        const newBufferLength = arrayByteOffset + arrayByteLength;
        // Resize buffer
        this.resizeBuffer(newBufferLength);
        // Get typed array view
        const bufferView = this.bufferView;//TypedArrayView<T>(this._buffer, arrayByteOffset, arrayByteLength / BYTES_PER_ELEMENT, this._viewConstructor);
        // Insert array into buffer
        if (array instanceof this._viewConstructor) {
            // Insert array into buffer by copying
            bufferView.set(array, arrayByteOffset / BYTES_PER_ELEMENT);
        } else if (array instanceof Array) {
            // Insert array into buffer by creating new typed array view
            let tempView = new this._viewConstructor(array);
            // Copy temp view to buffer view
            bufferView.set(tempView, arrayByteOffset / BYTES_PER_ELEMENT);
        } else {
            throw new Error("BufferManager.allocateArray(): Argument is neither a view nor an array");
        }
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();

        // console.log(this._buffer, arrayByteOffset, arrayByteLength / BYTES_PER_ELEMENT, this._viewConstructor);
        
        const typedArrayView = TypedArrayView<T>(this._buffer, arrayByteOffset, arrayByteLength / BYTES_PER_ELEMENT, this._viewConstructor);
        // Add this buffer to the list of instances
        this.instances.add(typedArrayView);
        // Construct current buffer view
        return typedArrayView;
    }

    // Remove this buffer from the list of instances
    freeArray (typedArrayView: TypedArrayView<T>) {
        if (!this.instances.has(typedArrayView)) {
            throw new Error("BufferManager.freeArray(): TypedArrayView instance not found");
        }
        // Remove this buffer from the list of instances
        this.instances.delete(typedArrayView);
        // Update length
        this._length = this._length - typedArrayView.length;
        // Get buffer attributes
        const arrayByteOffset = typedArrayView.byteOffset;
        const arrayByteLength = typedArrayView.byteLength;
        const bufferByteLength = this._buffer.byteLength;
        // Shift all memory after this one to the left by byteLength
        const uint8ArrayBufferView = new Uint8Array(this._buffer);
        uint8ArrayBufferView.copyWithin(arrayByteOffset, arrayByteOffset + arrayByteLength, bufferByteLength);
        // Readjust views
        // Shift all instances views to the right of current instance to the left by arrayByteLength
        for (let instance of this.instances) {
            // Check if instance is to the right of current instance and shift if so
            if (instance.byteOffset > arrayByteOffset) instance.shift(instance.byteOffset - arrayByteLength, instance.length);
        }
        // Resize buffer to remove unused space at the end by arrayByteLength
        // this._buffer.resize(bufferByteLength - arrayByteLength);
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }

    // Free all buffers and clear instances set
    freeAll() {
        // this._buffer.resize(0);
        this.instances.clear();
        // Update length
        this._length = 0;
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }

    overwriteAll(array: T | Array<number>) {
        // if (array.length == 22) console.log("OVERWRITE ALL", array);
        const BYTES_PER_ELEMENT = this._viewConstructor.prototype.BYTES_PER_ELEMENT;
        // Get array attributes
        const arrayLength: number = array.length;
        const arrayByteLength: number = arrayLength * BYTES_PER_ELEMENT;
        // if (array.length == 22) console.log("LENGTH New / Old", newBufferByteLength, bufferByteLength);
        // Resize buffer if neccessary
        this.resizeBuffer(arrayByteLength);
        // Copy data over to buffer, we've already ensured the buffer has exactly as much space as we need
        const bufferView = this.bufferView;
        // if (array.length == 22) console.log("BUFFER VIEW", Array.from(bufferView));
        // Insert array into buffer
        if (array instanceof this._viewConstructor) {
            // Insert array into buffer by copying
            bufferView.set(array);
            // if (array.length == 22) console.log("IN", Array.from(this.bufferView));
        } else if (array instanceof Array) {
            // Insert array into buffer iteratively
            let i: number = 0;
            for (let value of array) bufferView[i++] = value;
            // if (array.length == 22) console.log("IN", Array.from(this.bufferView));
        } else {
            throw new Error("BufferManager.overwriteAll(): Argument is neither a view nor an array");
        }

        // if (array.length == 22) console.log("OUT", Array.from(this.bufferView));
        // Reconstruct GPUBuffer if it exists due to resize
        if (this._gpuBuffer) this._gpuBuffer.reconstruct();
    }


    bindGPUBuffer(gpuBuffer: BufferToGPU) {
        if (this._gpuBuffer) {
            throw new Error("BufferManager.bindGPUBuffer(): GPUBuffer already bound");
        }
        this._gpuBuffer = gpuBuffer;
    }

    releaseGPUBuffer() {
        this._gpuBuffer = undefined;
    }
}