"use strict";

import { Float16Array } from "./float-16-array";
export type TypedArray = Uint8Array | Uint16Array | Float16Array | Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;


const TypedArray = Object.getPrototypeOf(Uint8Array);

export interface ConstructorByBuffer<T extends TypedArray> {
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): T;
}

export interface ConstructorByArray<T extends TypedArray> {
    new (array: Array<number> | T): T;
}

export interface ConstructorByNumber<T extends TypedArray> {
    new (length: number): T;
}

export type Constructor<T extends TypedArray> = ConstructorByBuffer<T> & ConstructorByArray<T> & ConstructorByNumber<T>;

const TypeScriptAssign = <O extends Object, K extends keyof O> (obj: O, key: K, val: O[K]) => obj[key] = val;

const functionWrapper = <
    O extends Object, K extends keyof O, P extends Array<any>,
    R, F extends ((...args: P) => R)
> (object: O, key: K, _foo: F & O[K]): F => {
    return ((...args: P): R => (object[key] as F)(...args)) as F;
}

type StringTag<T extends TypedArray> = 
    T extends Uint8Array ? "Uint8Array" :
    T extends Uint16Array ? "Uint16Array" :
    T extends Float16Array ? "Float16Array" :
    T extends Uint32Array ? "Uint32Array" :
    T extends Int8Array ? "Int8Array" :
    T extends Int16Array ? "Int16Array" :
    T extends Int32Array ? "Int32Array" :
    T extends Float32Array ? "Float32Array" :
    T extends Float64Array ? "Float64Array" : never;
      
// Reimplementation to allow Views to implement typed arrays
class TypedArrayReimplementation<T extends TypedArray> {
    private readonly TypedArrayConstructor: Constructor<T>;
    private readonly stringTag: StringTag<T>;

    readonly BYTES_PER_ELEMENT: number;
    readonly buffer: ArrayBuffer;
    private arrayView: T;
    // Add offset as custom property
    offset: number;

    length: number;
    byteOffset: number;
    byteLength: number;
    // Array methods
    every;
    filter;
    find;
    findIndex;
    forEach;
    includes;
    indexOf;
    join;
    lastIndexOf;
    map;
    reduce;
    reduceRight;
    set;
    slice;
    some;
    subarray;
    toLocaleString;
    toString;
    values;

    entries;
    keys;

    [n: number]: number;  // Add numeric index signature
    
    constructor(buffer: ArrayBuffer, byteOffset: number, length: number, TypedArrayConstructor: Constructor<T>) {
        
        // super();
        this.TypedArrayConstructor = TypedArrayConstructor;
        // Set array view
        const arrayView: T = new TypedArrayConstructor(buffer, byteOffset, length);
        this.stringTag = arrayView[Symbol.toStringTag] as StringTag<T>;
        // Wrap array methods to array view
        this.every = functionWrapper(arrayView, "every", arrayView.every);
        this.filter = functionWrapper(arrayView, "filter", arrayView.filter);
        this.find = functionWrapper(arrayView, "find", arrayView.find);
        this.findIndex = functionWrapper(arrayView, "findIndex", arrayView.findIndex);
        this.forEach = functionWrapper(arrayView, "forEach", arrayView.forEach);
        this.includes = functionWrapper(arrayView, "includes", arrayView.includes);
        this.indexOf = functionWrapper(arrayView, "indexOf", arrayView.indexOf);
        this.join = functionWrapper(arrayView, "join", arrayView.join);
        this.lastIndexOf = functionWrapper(arrayView, "lastIndexOf", arrayView.lastIndexOf);
        this.map = functionWrapper(arrayView, "map", arrayView.map);
        this.reduce = functionWrapper(arrayView, "reduce", arrayView.reduce);
        this.reduceRight = functionWrapper(arrayView, "reduceRight", arrayView.reduceRight);
        this.set = functionWrapper(arrayView, "set", arrayView.set);
        this.slice = functionWrapper(arrayView, "slice", arrayView.slice);
        this.some = functionWrapper(arrayView, "some", arrayView.some);
        this.subarray = functionWrapper(arrayView, "subarray", arrayView.subarray);
        this.toLocaleString = functionWrapper(arrayView, "toLocaleString", arrayView.toLocaleString);
        this.toString = functionWrapper(arrayView, "toString", arrayView.toString);
        this.values = functionWrapper(arrayView, "values", arrayView.values);
        this.entries = functionWrapper(arrayView, "entries", arrayView.entries);
        this.keys = functionWrapper(arrayView, "keys", arrayView.keys);
        // Set string tag
        this.BYTES_PER_ELEMENT = arrayView.BYTES_PER_ELEMENT;
        // Set buffer properties
        this.buffer = buffer;
        this.arrayView = arrayView;
        // Set array properties
        this.offset = byteOffset / arrayView.BYTES_PER_ELEMENT;
        this.length = arrayView.length;
        this.byteOffset = arrayView.byteOffset;
        this.byteLength = arrayView.byteLength;
    }

    private setArrayView(arrayView: T) {
        this.arrayView = arrayView;
        this.offset = arrayView.byteOffset / arrayView.BYTES_PER_ELEMENT;
        this.byteOffset = arrayView.byteOffset;
        this.length = arrayView.length;
        this.byteLength = arrayView.byteLength;
        // Redifine array methods for new array view
        this.every = functionWrapper(arrayView, "every", arrayView.every);
        this.filter = functionWrapper(arrayView, "filter", arrayView.filter);
        this.find = functionWrapper(arrayView, "find", arrayView.find);
        this.findIndex = functionWrapper(arrayView, "findIndex", arrayView.findIndex);
        this.forEach = functionWrapper(arrayView, "forEach", arrayView.forEach);
        this.includes = functionWrapper(arrayView, "includes", arrayView.includes);
        this.indexOf = functionWrapper(arrayView, "indexOf", arrayView.indexOf);
        this.join = functionWrapper(arrayView, "join", arrayView.join);
        this.lastIndexOf = functionWrapper(arrayView, "lastIndexOf", arrayView.lastIndexOf);
        this.map = functionWrapper(arrayView, "map", arrayView.map);
        this.reduce = functionWrapper(arrayView, "reduce", arrayView.reduce);
        this.reduceRight = functionWrapper(arrayView, "reduceRight", arrayView.reduceRight);
        this.set = functionWrapper(arrayView, "set", arrayView.set);
        this.slice = functionWrapper(arrayView, "slice", arrayView.slice);
        this.some = functionWrapper(arrayView, "some", arrayView.some);
        this.subarray = functionWrapper(arrayView, "subarray", arrayView.subarray);
        this.toLocaleString = functionWrapper(arrayView, "toLocaleString", arrayView.toLocaleString);
        this.toString = functionWrapper(arrayView, "toString", arrayView.toString);
        this.values = functionWrapper(arrayView, "values", arrayView.values);
        this.entries = functionWrapper(arrayView, "entries", arrayView.entries);
        this.keys = functionWrapper(arrayView, "keys", arrayView.keys);
    }

    // Custom methods
    shift (byteOffset: number, length: number) {
        this.setArrayView(new this.TypedArrayConstructor(this.buffer, byteOffset, length));
    }

    swapBuffer(buffer: ArrayBuffer) {
        this.setArrayView(new this.TypedArrayConstructor(buffer, this.byteOffset, this.length));
    }

    writeValueAt(index: number, value: number): boolean {
        if (index < 0 || index >= this.length) return false;
        this.arrayView[index] = value;
        return true;
    }

    readValueAt(index: number) {
        return this.arrayView[index];
    }

    // Reimplementation of certain array methods
    valueOf(): T {
        return this.arrayView;
    }

    copyWithin(target: number, start: number, end?: number): this {
        this.arrayView.copyWithin(target, start, end);
        return this;
    }
    
    reverse(): this {
        this.arrayView.reverse();
        return this;
    }

    fill(value: number, start?: number, end?: number): this {
        this.arrayView.fill(value, start, end);
        return this;
    }

    sort(compareFn?: (a: number, b: number) => number): this {
        this.arrayView.sort(compareFn);
        return this;
    }

    *[Symbol.iterator](): IterableIterator<number> {
        // Iterate over elements
        for (let i = 0; i < this.length; i++) yield this.arrayView[i]!;
    }

    get [Symbol.toStringTag]() {
        return this.stringTag;
    }
}


class Handler<T extends TypedArray> {
    private targetKeySet: Set<string>;

    constructor(target: TypedArrayReimplementation<T>) {
        const keyList = Object.keys(target) as Array<string>;
        this.targetKeySet = new Set(keyList);
    }

    get(target: TypedArrayReimplementation<T>, prop: string): any {
        const asNumber = Number(prop);
        // If property is an integer, return the value at the index
        if (Number.isInteger(asNumber)) return target.readValueAt(asNumber);
        // Otherwise, return the property
        return target[prop as keyof TypedArrayReimplementation<T>];
    }

    set(target: TypedArrayReimplementation<T>, prop: string, value: any): boolean {
        const asNumber = Number(prop);
        // If property is an integer, set the value at the index
        if (Number.isInteger(asNumber)) {
            return target.writeValueAt(asNumber, value);
        }
        // Otherwise, set the respective property if key is in keySet
        if (this.targetKeySet.has(prop)) {
            TypeScriptAssign(target, prop as keyof TypedArrayReimplementation<T>, value);
            return true;
        }
        return false;
    }
}

export type TypedArrayView<T extends TypedArray> = TypedArrayReimplementation<T>;

export function TypedArrayView<T extends TypedArray>(buffer: ArrayBuffer, byteOffset: number, length: number, TypedArrayConstructor: Constructor<T>) : TypedArrayView<T> {
    const target = new TypedArrayReimplementation<T>(buffer, byteOffset, length, TypedArrayConstructor);
    return new Proxy(target, new Handler<T>(target));
}
// export const Float32ArrayView = (buffer: ArrayBuffer, byteOffset: number, length: number) =>  TypedArrayView<Float32Array>(buffer, byteOffset, length, Float32Array);