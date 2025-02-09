"use strict";

import { BVH, BVHArrays, BVHLeaf, BVHNode, Bounding } from "./bvh";
import { BIAS, POW32M1, Vector, matrix_vector_mul, vector_add, vector_difference, vector_scale } from "../lib/math";
import { Instance } from "./instance";
import { Transform } from "./transform";
import { Triangle } from "./triangle-bvh";


export const BVH_MAX_INSTANCES_PER_LEAF = 2;


export class IndexedInstance {
    instance: Instance;
    bounding: Bounding;
    id: number;

    area: number;

    constructor(instance: Instance, bounding: Bounding, id: number) {
        this.instance = instance;
        this.bounding = bounding;
        this.id = id;

        // Calculate area of instance
        let boundingDiff = vector_difference(bounding.max, bounding.min);
        this.area = boundingDiff.x * boundingDiff.y + boundingDiff.y * boundingDiff.z + boundingDiff.z * boundingDiff.x * 2;
    }
}

// Indexed Instance BVH class for constructing dynamic BVHs for instances
export class IndexedInstanceBVH extends BVH<IndexedInstance> {
    constructor(instances: Array<IndexedInstance>) {
        const bvh = IndexedInstanceBVH.subdivideTree(instances, Infinity, 0, 0, POW32M1);
        super(bvh);
    }

    toArrays(): BVHArrays {
        const boundingVertices: Array<number> = [];
        const bvh: Array<number> = [];

        /*
        this.dfsTraverseBinary( 
            (node: BVHNode<IndexedInstance>, sibling: BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> | undefined) => {
                // boundingVertices.push(node.bounding.min.x, node.bounding.min.y, node.bounding.min.z, node.bounding.max.x, node.bounding.max.y, node.bounding.max.z);
                // console.log("NODE", node, "\n SIBLING", sibling);
                boundingVertices.push(  ...(node.children[0]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[0]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ...(node.children[1]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[1]?.bounding.max ?? new Vector(0, 0, 0)));

                // boundingVertices.push(  ...(sibling?.bounding.min ?? new Vector(0, 0, 0)), ...(sibling?.bounding.max ?? new Vector(0, 0, 0)));
                
                bvh.push(1, node.parentId, sibling?.id ?? POW32M1, node.children[0]?.id ?? POW32M1, node.children[1]?.id ?? POW32M1);
            },
            (leaf: BVHLeaf<IndexedInstance>, sibling: BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> | undefined) => {
                // boundingVertices.push(leaf.bounding.min.x, leaf.bounding.min.y, leaf.bounding.min.z, leaf.bounding.max.x, leaf.bounding.max.y, leaf.bounding.max.z);
                boundingVertices.push(... new Vector({vector_length: 12}));
                /// console.log("LEAF", leaf, "\n SIBLING", sibling);
                // boundingVertices.push(  ...(sibling?.bounding.min ?? new Vector(0, 0, 0)), ...(sibling?.bounding.max ?? new Vector(0, 0, 0)));
                bvh.push(0, leaf.parentId, sibling?.id ?? POW32M1, leaf.children[0]?.id ?? POW32M1, leaf.children[1]?.id ?? POW32M1);
            },
            this.root
        );
        */
        
        // Traverse tree using depth first search starting from root
        this.dfsTraverse(
            (node: BVHNode<IndexedInstance>) => {
                // boundingVertices.push(node.bounding.min.x, node.bounding.min.y, node.bounding.min.z, node.bounding.max.x, node.bounding.max.y, node.bounding.max.z);
                boundingVertices.push(  ...(node.children[0]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[0]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ...(node.children[1]?.bounding.min ?? new Vector(0, 0, 0)), ...(node.children[1]?.bounding.max ?? new Vector(0, 0, 0)));
                bvh.push(1, node.children[0]?.id ?? POW32M1, node.children[1]?.id ?? POW32M1);
            },
            (leaf: BVHLeaf<IndexedInstance>) => {
                // boundingVertices.push(leaf.bounding.min.x, leaf.bounding.min.y, leaf.bounding.min.z, leaf.bounding.max.x, leaf.bounding.max.y, leaf.bounding.max.z);
                boundingVertices.push(  ...(leaf.children[0]?.bounding.min ?? new Vector(0, 0, 0)), ...(leaf.children[0]?.bounding.max ?? new Vector(0, 0, 0)),
                                        ...(leaf.children[1]?.bounding.min ?? new Vector(0, 0, 0)), ...(leaf.children[1]?.bounding.max ?? new Vector(0, 0, 0)));
                bvh.push(0, leaf.children[0]?.id ?? POW32M1, leaf.children[1]?.id ?? POW32M1);
            },
            this.root
        );
        
        return { boundingVertices, bvh };
    }

    private static isInstanceInBounding(instance: IndexedInstance, bound: Bounding): boolean {
        return super.isVertexInBounding(instance.bounding.min, bound) && super.isVertexInBounding(instance.bounding.max, bound);
    }

    private static tightenBoundingInstances(instances: Array<IndexedInstance>): Bounding {
        let vertices: Array<Vector<3>> = [];
        for (let instance of instances) vertices.push(instance.bounding.min, instance.bounding.max);
        // Construct bounding
        let bounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
        // Iterate over vertices, tightening bounding
        for (let vertex of vertices) {
            bounding.min.x = Math.min(bounding.min.x, vertex.x);
            bounding.min.y = Math.min(bounding.min.y, vertex.y);
            bounding.min.z = Math.min(bounding.min.z, vertex.z);
            bounding.max.x = Math.max(bounding.max.x, vertex.x);
            bounding.max.y = Math.max(bounding.max.y, vertex.y);
            bounding.max.z = Math.max(bounding.max.z, vertex.z);
        }
        return bounding;
    }

    private static fillFlatTree(instances: Array<IndexedInstance>, startingId: number, parentId: number): BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> {
        // Tighten bounding
        const bounding = IndexedInstanceBVH.tightenBoundingInstances(instances);
        // Base case: if there are less than BVH_MAX_INSTANCES_PER_LEAF instances, return a leaf
        if (instances.length <= BVH_MAX_INSTANCES_PER_LEAF) return new BVHLeaf(instances, bounding, startingId, startingId + 1);

        const instancesPerChild: number = Math.ceil(instances.length / BVH_MAX_INSTANCES_PER_LEAF);

        const children: Array<BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        for (let i = 0; i < instances.length; i += instancesPerChild) {
            const childInstances = instances.slice(i, Math.min(i + instancesPerChild, instances.length));
            const child = IndexedInstanceBVH.fillFlatTree(childInstances, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }
    /*
    private static evaluateSplitCost(instances: Array<IndexedInstance>, bounding0: Bounding, bounding1: Bounding): number {

        // Calculate the number of instances that are in both bounding volumes
        let instancesIn0 = 0;
        let instancesIn1 = 0;
        let instancesOnCutoff = 0;
        for (let instance of instances) {
            const in0 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding0);
            const in1 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding1);
            if (in0 && !in1) instancesIn0 += instance.instance.prototype.triangles.length;
            else if (!in0 && in1) instancesIn1 += instance.instance.prototype.triangles.length;
            else instancesIn0 += instance.instance.prototype.triangles.length;
        }

        // const instanceCount = instances.length;
        
        console.log("Instances in 0", instancesIn0);
        console.log("Instances in 1", instancesIn1);
        console.log("Instances on cutoff", instancesOnCutoff);
        
        // If one box contains all instances, the cost is Infinity as no subdivision is happening
        // if (instancesIn0 === instanceCount || instancesIn1 === instanceCount || instancesOnCutoff === instanceCount) return Infinity;
        if (instancesIn0 === 0 || instancesIn1 === 0) return Infinity;
        // Minimize for minimum instances on cutoff and equal distribution of instances across bounding0 and bounding1
        return instancesOnCutoff + Math.abs(instancesIn0 - instancesIn1);
    }
    */

    private static evaluateSplitCost(instances: Array<IndexedInstance>, bounding0: Bounding, bounding1: Bounding): number {
        // Calculate the number of instances that are in both bounding volumes
        let instancesIn0 = 0;
        let instancesIn0Area = 0;
        let instancesIn1 = 0;
        let instancesIn1Area = 0;
        for (let instance of instances) {
            const in0 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding0);
            const in1 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding1);
            if (in1) {
                instancesIn1++;
                instancesIn1Area += instance.area;
            } else {
                instancesIn0++;
                instancesIn0Area += instance.area;
            }
            // else trianglesOnCutoff++;
        }

        // const triangleCount = triangles.length;
        // If one box contains all triangles, the cost is Infinity as no subdivision is happening.
        // if (trianglesIn0 === triangleCount || trianglesIn1 === triangleCount || trianglesOnCutoff === triangleCount) return Infinity;
        if (instancesIn0 === 0 || instancesIn1 === 0) return Infinity;
        // Minimize for minimum triangles on cutoff and equal distribution of triangles across bounding0 and bounding1.
        return Math.abs(instancesIn0Area - instancesIn1Area);
    }


    private static subdivideTree(instances: Array<IndexedInstance>, maxDepth: number = Infinity, depth: number = 0, startingId: number = 0, parentId: number = 0): BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance> {
        // console.log("Subdividing tree", instances.length, depth, maxDepth);
        // Tighten bounding
        const bounding = IndexedInstanceBVH.tightenBoundingInstances(instances);
        // Base case: if there are less than BVH_MAX_INSTANCES_PER_LEAF instances, return a leaf
        if (instances.length <= BVH_MAX_INSTANCES_PER_LEAF || depth > maxDepth) return new BVHLeaf(instances, bounding, startingId, startingId + 1);

        // Split bounding into two sub bounding volumes along the axis minimizing the cost of instance split
        const centerOfMass = vector_scale(vector_add(bounding.min, bounding.max), 0.5);
        /*
        let splitAlongAxis: "x" | "y" | "z" = "x";
        let minCost: number = Infinity;
        for (let axis of ["x", "y", "z"] as Array<"x" | "y" | "z">) {
            const cost = IndexedInstanceBVH.evaluateSplitCost(instances, bounding, centerOfMass, axis);
            if (cost < minCost) {
                minCost = cost;
                splitAlongAxis = axis;
            }
        }
        // console.log("Split along axis", splitAlongAxis, minCost);
        // If no subdivision is happening, return flat tree to avoid infinite recursion
        if (minCost === Infinity) {
            // console.warn("No spatial subdivision possible for", instances.length, "instances.");
            return IndexedInstanceBVH.fillFlatTree(instances, startingId, parentId);
        }
        */

        const intervals = 2;

        let splitAlongAxis: "x" | "y" | "z" = "x";
        let splitAt: number = 0;
        let minCost: number = Infinity;
        for (let axis of ["x", "y", "z"] as Array<"x" | "y" | "z">) {
            let splitDistIncrement = (bounding.max[axis] - bounding.min[axis]) / intervals;

            for (let i = 1; i < intervals; i++) {
                const bounding0Max = new Vector(bounding.max);
                const bounding1Min = new Vector(bounding.min);
                bounding0Max[axis] = bounding.min[axis] + i * splitDistIncrement;
                bounding1Min[axis] = bounding.min[axis] + i * splitDistIncrement;
                // Define two bounding volumes
                const bounding0 = { min: bounding.min, max: bounding0Max };
                const bounding1 = { min: bounding1Min, max: bounding.max };

                const cost = IndexedInstanceBVH.evaluateSplitCost(instances, bounding0, bounding1);
                // console.log(cost);
                if (cost < minCost) {
                    minCost = cost;
                    splitAlongAxis = axis;
                    splitAt = bounding.min[axis] + i * splitDistIncrement;
                }
            }
        }
        // If no subdivision is happening, return flat tree to avoid infinite recursion and unnecessary 
        if (minCost === Infinity) {
            // console.warn("No spacial subdivision possible for", triangles.length, "triangles.");
            return IndexedInstanceBVH.fillFlatTree(instances, startingId, parentId);
        }

        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[splitAlongAxis] = splitAt;
        bounding1Min[splitAlongAxis] = splitAt;

        /*
        const bounding0Max = new Vector(bounding.max);
        const bounding1Min = new Vector(bounding.min);
        bounding0Max[splitAlongAxis] = centerOfMass[splitAlongAxis];
        bounding1Min[splitAlongAxis] = centerOfMass[splitAlongAxis];
        */

        const bounding0 = { min: bounding.min, max: bounding0Max };
        const bounding1 = { min: bounding1Min, max: bounding.max };

        // Sort instances into bounding volumes
        // const instancesOnCutoff: Array<IndexedInstance> = [];
        const instancesInBound0: Array<IndexedInstance> = [];
        const instancesInBound1: Array<IndexedInstance> = [];

        for (let instance of instances) {
            const in0 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding0);
            const in1 = IndexedInstanceBVH.isInstanceInBounding(instance, bounding1);
            if (in0 && !in1) instancesInBound0.push(instance);
            else if (!in0 && in1) instancesInBound1.push(instance);
            else instancesInBound0.push(instance);
        }
        /*
        console.log("Instances in bound 0", instancesInBound0.length);
        console.log("Instances in bound 1", instancesInBound1.length);
        console.log("Instances on cutoff", instancesOnCutoff.length);
        */

        let children: Array<BVHNode<IndexedInstance> | BVHLeaf<IndexedInstance>> = [];
        // Assign ids to children
        let nextId = startingId + 1;
        // Recursively subdivide bounding volumes if respective bounding volumes contain instances
        if (instancesInBound0.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesInBound0, maxDepth, depth + 1, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }
        /*

        if (instancesOnCutoff.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesOnCutoff, maxDepth, depth + 1, nextId);
            children.push(child);
            nextId = child.nextId;
        }
        */

        if (instancesInBound1.length > 0) {
            const child = IndexedInstanceBVH.subdivideTree(instancesInBound1, maxDepth, depth + 1, nextId, startingId);
            children.push(child);
            nextId = child.nextId;
        }

        return new BVHNode(children, bounding, startingId, nextId);
    }

    static fromInstances(instances: Array<Instance> | Set<Instance>): IndexedInstanceBVH {
        let indexedInstances: Array<IndexedInstance> = [];
        let id: number = 0;
        // Iterate over instances, assigning ids and calculate boundings
        for (let instance of instances) {
            const untransformedBounding: Bounding = instance.prototype.bounding;
            // Get all corners of bounding volume
            const corners: Array<Vector<3>> = [
                new Vector(untransformedBounding.min.x, untransformedBounding.min.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.min.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.max.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.min.x, untransformedBounding.max.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.min.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.min.y, untransformedBounding.max.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.max.y, untransformedBounding.min.z),
                new Vector(untransformedBounding.max.x, untransformedBounding.max.y, untransformedBounding.max.z)
            ];

            // Get transform
            const transform: Transform = instance.transform;
            const transformedBounding: Bounding = { min: new Vector(Infinity, Infinity, Infinity), max: new Vector(-Infinity, -Infinity, -Infinity) };
            // Transform all corners
            for (let corner of corners) {
                const transformedCorner = vector_add(matrix_vector_mul(transform.matrix, corner), transform.position);
                transformedBounding.min.x = Math.min(transformedBounding.min.x, transformedCorner.x) - BIAS;
                transformedBounding.min.y = Math.min(transformedBounding.min.y, transformedCorner.y) - BIAS;
                transformedBounding.min.z = Math.min(transformedBounding.min.z, transformedCorner.z) - BIAS;
                transformedBounding.max.x = Math.max(transformedBounding.max.x, transformedCorner.x) + BIAS;
                transformedBounding.max.y = Math.max(transformedBounding.max.y, transformedCorner.y) + BIAS;
                transformedBounding.max.z = Math.max(transformedBounding.max.z, transformedCorner.z) + BIAS;
            }
            // Push indexed instance
            indexedInstances.push(new IndexedInstance(instance, transformedBounding, id ++));
        }
        // Return indexed instance BVH
        return new IndexedInstanceBVH(indexedInstances);
    }
}