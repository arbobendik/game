"use strict";

import { Scene } from "./scene";
import { Transform } from "./transform";
import { InstanceMaterial, Material } from "./material";
import { Prototype } from "./prototype";
import { AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture } from "./texture";

export class Instance {
    readonly scene: Scene;
    readonly prototype: Prototype;

    transform: Transform;
    _material: InstanceMaterial;

    // Texture instances
    albedo: AlbedoTexture | undefined = undefined;
    normal: NormalTexture | undefined = undefined;
    emissive: EmissiveTexture | undefined = undefined;
    roughness: RoughnessTexture | undefined = undefined;
    metallic: MetallicTexture | undefined = undefined;

    constructor(scene: Scene, prototype: Prototype) {
        // Set scene
        this.scene = scene;
        // Set prototype
        this.prototype = prototype;
        // Set transform
        this.transform = new Transform(scene.instanceTransformManager);
        // Set material
        this._material = new InstanceMaterial(scene.instanceMaterialManager, prototype.material);
    }

    set material(material: Material) {
        // Set all material properties to instance material
        this._material.color = material.color;
        this._material.emissive = material.emissive;
        this._material.roughness = material.roughness;
        this._material.metallic = material.metallic;
        this._material.transmission = material.transmission;
        this._material.ior = material.ior;
    }

    get material(): Material {
        return this._material;
    }

    destroy(): void {
        this.transform?.destroy();
        this._material.destroy();
    }
}