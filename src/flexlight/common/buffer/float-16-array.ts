"use strict";

export class Float16Array extends Uint16Array {
    from = (array: Float32Array | Array<number>) => {
        // Create view arrays to convert array
        let floatView = new Float32Array(array);
        let int32View = new Int32Array(floatView.buffer);
        for (let i = 0; i < array.length; i++) {
            let x: number = int32View[i]!;
            let bits = (x >> 16) & 0x8000;
            let m = (x >> 12) & 0x07ff;
            let e = (x >> 23) & 0xff;
            if (e < 103) {
                this[i] = bits;
                continue;
            }
            if (e > 142) {
                bits |= 0x7c00;
                bits |= ((e == 255) ? 0 : 1) && (x & 0x007fffff);
                this[i] = bits;
                continue;
            }
            if (e < 113) {
                m |= 0x0800;
                bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
                this[i] = bits;
                continue;
            }
            bits |= ((e - 112) << 10) | (m >> 1);
            bits += m & 1;
            this[i] = bits;
        }
        return this;
    }

    constructor (item: ArrayBuffer | Float32Array | Array<number> | number, byteOffset?: number, length?: number) {
        const isArray = Array.isArray(item) || item instanceof Float32Array;
        const isBuffer = item instanceof ArrayBuffer && byteOffset !== undefined && length !== undefined;
        const isNumber = typeof item === "number";

        if (isArray) {
            // @ts-expect-error
            super(item.length);
            this.from(item);
        } else if (isNumber) {
            super(item);
        } else if (isBuffer) {
            super(item, byteOffset, length);
        } else {
            throw new Error("Invalid arguments for Float16Array constructor");
        }
    }
}