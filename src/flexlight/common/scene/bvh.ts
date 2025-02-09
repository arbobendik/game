"use strict";

import { Triangle } from "./triangle-bvh";
import { IndexedInstance } from "./instance-bvh";
import { BIAS, POW32M1, Vector, vector_difference } from "../lib/math";


export interface Bounding {
    min: Vector<3>;
    max: Vector<3>;
}

export class BVHLeaf<T extends Triangle | IndexedInstance> {
    children: Array<T>;
    bounding: Bounding;
    id: number;
    nextId: number;
    private _offset: number | undefined;
    
    constructor(children: Array<T>, bounding: Bounding, id: number, nextId: number) {
        this.children = children;
        this.bounding = bounding;
        this.id = id;
        this.nextId = nextId;
    }

    set offset(offset: number) {
        this._offset = offset;
    }

    get offset(): number {
        if (this._offset) return this._offset;
        else throw new Error("Offset not set for BVHLeaf with id: " + this.id);
    }
    destroy() {
        // Dereference children
        this.children = [];
    }

    *[Symbol.iterator]() {
        for (let child of this.children) {
            yield child;
        }
    }
}

export class BVHNode<T extends Triangle | IndexedInstance> {
    children: Array<BVHNode<T> | BVHLeaf<T>>;
    bounding: Bounding;
    id: number;
    nextId: number;
    private _offset: number | undefined;

    constructor(children: Array<BVHNode<T> | BVHLeaf<T>>, bounding: Bounding, id: number, nextId: number) {
        this.children = children;
        this.bounding = bounding;
        this.id = id;
        this.nextId = nextId;
    }

    set offset(offset: number) {
        this._offset = offset;
    }

    get offset(): number {
        if (this._offset) return this._offset;
        else throw new Error("Offset not set for BVHNode with id: " + this.id);
    }

    destroy() {
        // Dereference children
        for (let child of this.children) child.destroy();
        this.children = [];
    }

    *[Symbol.iterator]() {
        for (let child of this.children) {
            yield child;
        }
    }
}

export interface BVHArrays {
    boundingVertices: Array<number>;
    bvh: Array<number>;
}


export class BVH<T extends Triangle | IndexedInstance> {
    root: BVHNode<T> | BVHLeaf<T>;

    constructor(root: BVHNode<T> | BVHLeaf<T>) {
        this.root = root;
    }

    dfsTraverseBinary(
        callbackNode: (node: BVHNode<T>, sibling: BVHNode<T> | BVHLeaf<T> | undefined) => void,
        callbackLeaf: (leaf: BVHLeaf<T>, sibling: BVHNode<T> | BVHLeaf<T> | undefined) => void,
        root: BVHNode<T> | BVHLeaf<T>,
        sibling: BVHNode<T> | BVHLeaf<T> | undefined = undefined
    ) {
        if (root instanceof BVHLeaf) {
            callbackLeaf(root, sibling);
        } else if (root instanceof BVHNode) {
            callbackNode(root, sibling);
            if (root.children[0]) this.dfsTraverseBinary(callbackNode, callbackLeaf, root.children[0], root.children[1]);
            if (root.children[1]) this.dfsTraverseBinary(callbackNode, callbackLeaf, root.children[1], root.children[0]);
        }
    }

    dfsTraverse(callbackNode: (node: BVHNode<T>) => void, callbackLeaf: (leaf: BVHLeaf<T>) => void, root: BVHNode<T> | BVHLeaf<T>) {
        if (root instanceof BVHLeaf) {
            callbackLeaf(root);
        } else if (root instanceof BVHNode) {
            callbackNode(root);
            for (let child of root.children) this.dfsTraverse(callbackNode, callbackLeaf, child);
        }
    }

    protected static isVertexInBounding(vertex: Vector<3>, bound: Bounding): boolean {
        return bound.min.x - BIAS <= vertex.x && bound.min.y - BIAS <= vertex.y && bound.min.z - BIAS <= vertex.z &&
               bound.max.x + BIAS >= vertex.x && bound.max.y + BIAS >= vertex.y && bound.max.z + BIAS >= vertex.z;
    }

    protected static longestAxis(bounding: Bounding): "x" | "y" | "z" {
        const diff = vector_difference(bounding.max, bounding.min);
        return diff.x > diff.y && diff.x > diff.z ? "x" : diff.y > diff.z ? "y" : "z";
    }
}
