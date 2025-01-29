const TRIANGLE_SIZE: u32 = 6u;

const INSTANCE_UINT_SIZE: u32 = 9u;

// const INSTANCE_TRANSFORM_SIZE: u32 = 1u;
// const INSTANCE_MATERIAL_SIZE: u32 = 11u;

const BVH_TRIANGLE_SIZE: u32 = 1u;
const BVH_INSTANCE_SIZE: u32 = 1u;

const TRIANGLE_BOUNDING_VERTICES_SIZE: u32 = 5u;
const INSTANCE_BOUNDING_VERTICES_SIZE: u32 = 4u;

const POINT_LIGHT_SIZE: u32 = 8u;

const PI: f32 = 3.141592653589793;
const PHI: f32 = 1.61803398874989484820459;
const SQRT3: f32 = 1.7320508075688772;
const POW32: f32 = 4294967296.0;
const MAX_SAFE_INTEGER_FOR_F32: f32 = 8388607.0;
const MAX_SAFE_INTEGER_FOR_F32_U: u32 = 8388607u;
const UINT_MAX: u32 = 4294967295u;
const BIAS: f32 = 0.0000152587890625;
const INV_PI: f32 = 0.3183098861837907;
const INV_255: f32 = 0.00392156862745098;


struct Transform {
    rotation: mat3x3<f32>,
    shift: vec3<f32>,
};

struct UniformFloat {
    view_matrix: mat3x3<f32>,
    view_matrix_jitter: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    min_importancy: f32,
};

struct UniformUint {
    render_size: vec2<u32>,
    temporal_target: u32,
    temporal_max: u32,
    is_temporal: u32,

    samples: u32,
    max_reflections: u32,

    tonemapping_operator: u32,
};

@group(0) @binding(0) var compute_out: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(1) var<storage, read> texture_offset: array<u32>;
@group(0) @binding(2) var texture_absolute_position: texture_2d<f32>;
@group(0) @binding(3) var texture_uv: texture_2d<f32>;
@group(0) @binding(4) var shift_out: texture_2d_array<f32>;

// ComputeTextureBindGroup
@group(1) @binding(0) var texture_data: texture_2d_array<u32>;
@group(1) @binding(1) var<storage, read> texture_instance_buffer: array<u32>;

// ComputeGeometryBindGroup
@group(2) @binding(0) var triangles: texture_2d_array<f32>;
@group(2) @binding(1) var triangle_bvh: texture_2d_array<u32>;
@group(2) @binding(2) var triangle_bounding_vertices: texture_2d_array<f32>;

// ComputeDynamicBindGroup
@group(3) @binding(0) var<uniform> uniforms_float: UniformFloat;
@group(3) @binding(1) var<uniform> uniforms_uint: UniformUint;
@group(3) @binding(2) var<storage, read> lights: array<f32>;

@group(3) @binding(3) var<storage, read> instance_uint: array<u32>;
@group(3) @binding(4) var<storage, read> instance_transform: array<Transform>;
@group(3) @binding(5) var<storage, read> instance_material: array<Material>;
@group(3) @binding(6) var<storage, read> instance_bvh: array<vec3<u32>>;
@group(3) @binding(7) var<storage, read> instance_bounding_vertices: array<vec3<f32>>;

struct Ray {
    origin: vec3<f32>,
    unit_direction: vec3<f32>,
};

struct Material {
    albedo: vec3<f32>,
    emissive: vec3<f32>,
    roughness: f32,
    metallic: f32,
    transmission: f32,
    ior: f32
};

struct Light {
    position: vec3<f32>,
    color: vec3<f32>,
    intensity: f32,
    variance: f32
};

struct Hit {
    suv: vec3<f32>,
    instance_index: u32,
    triangle_index: u32
};

/*
struct Sample {
    color: vec3<f32>,
    render_id_w: f32
}
*/


fn access_triangle(index: u32) -> vec4<f32> {
    // Divide triangle index by 2048 * 2048 to get layer
    let layer: u32 = index >> 22u;
    // Get height of triangle
    let height: u32 = (index >> 11u) & 0x7FFu;
    // Get width of triangle
    let width: u32 = index & 0x7FFu;
    // Return triangle
    return textureLoad(triangles, vec2<u32>(width, height), layer, 0);
}

fn access_triangle_bvh(index: u32) -> vec4<u32> {
    // Divide triangle index by 2048 * 2048 to get layer
    let layer: u32 = index >> 22u;
    // Get height of triangle
    let height: u32 = (index >> 11u) & 0x7FFu;
    // Get width of triangle
    let width: u32 = index & 0x7FFu;
    // Return triangle
    return textureLoad(triangle_bvh, vec2<u32>(width, height), layer, 0);
}

fn access_triangle_bounding_vertices(index: u32) -> vec4<f32> {
    // Divide triangle index by 2048 * 2048 to get layer
    let layer: u32 = index >> 22u;
    // Get height of triangle
    let height: u32 = (index >> 11u) & 0x7FFu;
    // Get width of triangle
    let width: u32 = index & 0x7FFu;
    // Return triangle
    return textureLoad(triangle_bounding_vertices, vec2<u32>(width, height), layer, 0);
}

// var render_id: vec4<f32> = vec4<f32>(0.0f);
// var render_original_id: vec4<f32> = vec4<f32>(0.0f);

// Lookup values for texture atlases
/*
fn fetchTexVal(atlas: texture_2d<f32>, uv: vec2<f32>, tex_num: f32, default_val: vec3<f32>) -> vec3<f32> {
    // Return default value if no texture is set
    if (tex_num == - 1.0f) {
        return default_val;
    }
    // Get dimensions of texture atlas
    let atlas_size: vec2<f32> = vec2<f32>(textureDimensions(atlas));
    let width: f32 = tex_num * uniforms.texture_size.x;
    let offset: vec2<f32> = vec2<f32>(
        width % atlas_size.x,
        atlas_size.y - floor(width / atlas_size.x) * uniforms.texture_size.y
    );
    // WebGPU quirk of having upsidedown height for textures
    let atlas_texel: vec2<i32> = vec2<i32>(offset + uv * uniforms.texture_size * vec2<f32>(1.0f, -1.0f));
    // Fetch texel on requested coordinate
    let tex_val: vec3<f32> = textureLoad(atlas, atlas_texel, 0).xyz;
    return tex_val;
}
*/

fn noise(n: vec2<f32>, seed: f32) -> vec4<f32> {
    // let temp_component: vec2<f32> = fract(vec2<f32>(uniforms.temporal_target * PHI, cos(uniforms.temporal_target) + PHI));
    // return fract(sin(dot(n.xy, vec2<f32>(12.9898f, 78.233f)) + vec4<f32>(53.0f, 59.0f, 61.0f, 67.0f) * seed) * 43758.5453f) * 2.0f - 1.0f;
    return fract(sin(dot(n.xy, vec2<f32>(12.9898f, 78.233f)) + vec4<f32>(53.0f, 59.0f, 61.0f, 67.0f) * sin(seed + f32(uniforms_uint.temporal_target) * PHI)) * 43758.5453f) * 2.0f - 1.0f;

}

fn moellerTrumbore(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, ray: Ray, l: f32) -> vec3<f32> {
    let edge1: vec3<f32> = b - a;
    let edge2: vec3<f32> = c - a;
    let pvec: vec3<f32> = cross(ray.unit_direction, edge2);
    let det: f32 = dot(edge1, pvec);
    let inv_det: f32 = 1.0f / det;
    let tvec: vec3<f32> = ray.origin - a;
    let u: f32 = dot(tvec, pvec) * inv_det;
    let qvec: vec3<f32> = cross(tvec, edge1);
    let v: f32 = dot(ray.unit_direction, qvec) * inv_det;
    let s: f32 = dot(edge2, qvec) * inv_det;
    if (v >= BIAS && u >= BIAS && u + v <= 1.0f && s <= l && s > BIAS) {
        return vec3<f32>(s, u, v);
    } else {
        return vec3<f32>(0.0f);
    }
}

// Simplified Moeller-Trumbore algorithm for detecting only forward facing triangles
fn moellerTrumboreCull(a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, ray: Ray, l: f32) -> bool {
    let edge1: vec3<f32> = b - a;
    let edge2: vec3<f32> = c - a;
    let pvec: vec3<f32> = cross(ray.unit_direction, edge2);
    let det: f32 = dot(edge1, pvec);
    let inv_det: f32 = 1.0f / det;
    let tvec: vec3<f32> = ray.origin - a;
    let u: f32 = dot(tvec, pvec) * inv_det;
    let qvec: vec3<f32> = cross(tvec, edge1);
    let v: f32 = dot(ray.unit_direction, qvec) * inv_det;
    let s: f32 = dot(edge2, qvec) * inv_det;
    return (v >= BIAS && u >= BIAS && u + v <= 1.0f && s <= l && s > BIAS);
}

// Bounding volume intersection test
fn rayBoundingVolume(min_corner: vec3<f32>, max_corner: vec3<f32>, ray: Ray, max_len: f32) -> f32 {
    let inv_dir: vec3<f32> = 1.0f / ray.unit_direction;
    let v0: vec3<f32> = (min_corner - ray.origin) * inv_dir;
    let v1: vec3<f32> = (max_corner - ray.origin) * inv_dir;
    let tmin: f32 = max(max(min(v0.x, v1.x), min(v0.y, v1.y)), min(v0.z, v1.z));
    let tmax: f32 = min(min(max(v0.x, v1.x), max(v0.y, v1.y)), max(v0.z, v1.z));

    if (tmax >= max(tmin, BIAS) && tmin < max_len) {
        return tmin;
    } else {
        return POW32;
    }
}


// Test for closest ray triangle intersection
// return intersection position in world space and index of target triangle in geometryTex
// plus instance and triangle index
fn traverseTriangleBVH(instance_index: u32, ray: Ray, l: f32) -> Hit {
    // Maximal distance a triangle can be away from the ray origin
    let instance_uint_offset = instance_index * INSTANCE_UINT_SIZE;

    let inverse_transform: Transform = instance_transform[instance_index * 2u + 1u];
    let inverse_dir = inverse_transform.rotation * ray.unit_direction;

    let t_ray = Ray(
        inverse_transform.rotation * (ray.origin + inverse_transform.shift),
        normalize(inverse_dir)
    );

    let triangle_instance_offset: u32 = instance_uint[instance_uint_offset];
    let instance_bvh_offset: u32 = instance_uint[instance_uint_offset + 1u];
    let instance_vertex_offset: u32 = instance_uint[instance_uint_offset + 2u];

    // Hit object
    // First element of vector is distance to intersection point
    var hit: Hit = Hit(vec3<f32>(l, 0.0f, 0.0f), UINT_MAX, UINT_MAX);
    // Stack for BVH traversal
    var stack: array<u32, 24> = array<u32, 24>();
    var stack_index: u32 = 1u;
    
    while (stack_index > 0u) {
        stack_index -= 1u;
        let node_index: u32 = stack[stack_index];

        let bvh_offset: u32 = instance_bvh_offset + node_index * BVH_TRIANGLE_SIZE;
        let vertex_offset: u32 = instance_vertex_offset + node_index * TRIANGLE_BOUNDING_VERTICES_SIZE;

        let indicator_and_children: vec3<u32> = access_triangle_bvh(bvh_offset).xyz;
        let child0: u32 = indicator_and_children.y;
        let child1: u32 = indicator_and_children.z;

        let bv0 = access_triangle_bounding_vertices(vertex_offset);
        let bv1 = access_triangle_bounding_vertices(vertex_offset + 1u);

        if (indicator_and_children.x == 0u) {
            let bv2 = access_triangle_bounding_vertices(vertex_offset + 2u);

            let a0 = bv0.xyz;
            let b0 = vec3<f32>(bv0.w, bv1.xy);
            let c0 = vec3<f32>(bv1.zw, bv2.x);

            // Test if triangle intersects ray
            let intersection0: vec3<f32> = moellerTrumbore(a0, b0, c0, t_ray, hit.suv.x);
            // Test if ray even intersects
            if(intersection0.x != 0.0) {
                // Calculate intersection point
                hit = Hit(intersection0, instance_index, triangle_instance_offset / TRIANGLE_SIZE + child0);
            }

            if (indicator_and_children.y != UINT_MAX) {
                let bv3 = access_triangle_bounding_vertices(vertex_offset + 3u);
                let bv4 = access_triangle_bounding_vertices(vertex_offset + 4u);

                let a1 = bv2.yzw;
                let b1 = bv3.xyz;
                let c1 = vec3<f32>(bv3.w, bv4.xy);
                
                // Test if triangle intersects ray
                let intersection1: vec3<f32> = moellerTrumbore(a1, b1, c1, t_ray, hit.suv.x);
                // Test if ray even intersects
                if(intersection1.x != 0.0) {
                    // Calculate intersection point
                    hit = Hit(intersection1, instance_index, triangle_instance_offset / TRIANGLE_SIZE + child1);
                }
            }
        } else {
            let min0 = bv0.xyz;
            let max0 = vec3<f32>(bv0.w, bv1.xy);
            let dist0: f32 = rayBoundingVolume(min0, max0, t_ray, hit.suv.x);

            let bv2 = access_triangle_bounding_vertices(vertex_offset + 2u);
            let min1 = vec3<f32>(bv1.zw, bv2.x);
            let max1 = bv2.yzw;

            let dist1: f32 = rayBoundingVolume(min1, max1, t_ray, hit.suv.x);

            if (dist0 < dist1) {
                if (child1 != UINT_MAX && dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
            } else {
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
                if (child1 != UINT_MAX && dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
            }
        }
    }
    
    // If nothing was hit, return false (not in shadow)
    return hit;
}


// Simplified rayTracer to only test if ray intersects anything
fn traverseInstanceBVH(ray: Ray) -> Hit {
    // Maximal distance a triangle can be away from the ray origin
    // var max_len: f32 = POW32;
    // Hit object
    var hit: Hit = Hit(vec3<f32>(POW32, 0.0f, 0.0f), UINT_MAX, UINT_MAX);
    // Stack for BVH traversal
    var stack = array<u32, 16>();
    var stack_index: u32 = 1u;

    while (stack_index > 0u) {
        stack_index -= 1u;
        let node_index: u32 = stack[stack_index];

        let bvh_offset: u32 = node_index * BVH_INSTANCE_SIZE;
        let vertex_offset: u32 = node_index * INSTANCE_BOUNDING_VERTICES_SIZE;
        
        let indicator_and_children: vec3<u32> = instance_bvh[bvh_offset];

        let child0: u32 = indicator_and_children.y;
        let child1: u32 = indicator_and_children.z;

        var dist0: f32 = POW32;
        var dist1: f32 = POW32;

        if (child0 != UINT_MAX) {
            let min0 = instance_bounding_vertices[vertex_offset];
            let max0 = instance_bounding_vertices[vertex_offset + 1u];
            dist0 = rayBoundingVolume(min0, max0, ray, hit.suv.x);
        }
        
        if (child1 != UINT_MAX) {
            let min1 = instance_bounding_vertices[vertex_offset + 2u];
            let max1 = instance_bounding_vertices[vertex_offset + 3u];
            dist1 = rayBoundingVolume(min1, max1, ray, hit.suv.x);
        }

        if (indicator_and_children.x == 0u) {
            if (dist0 < dist1) {
                if (dist1 != POW32) {
                    let new_hit: Hit = traverseTriangleBVH(child1, ray, hit.suv.x);
                    if (new_hit.suv.x < hit.suv.x) {
                        hit = new_hit;
                    }
                }
                if (dist0 != POW32) {
                    let new_hit: Hit = traverseTriangleBVH(child0, ray, hit.suv.x);
                    if (new_hit.suv.x < hit.suv.x) {
                        hit = new_hit;
                    }
                }
            } else {
                if (dist0 != POW32) {
                    let new_hit: Hit = traverseTriangleBVH(child0, ray, hit.suv.x);
                    if (new_hit.suv.x < hit.suv.x) {
                        hit = new_hit;
                    }
                }
                if (dist1 != POW32) {
                    let new_hit: Hit = traverseTriangleBVH(child1, ray, hit.suv.x);
                    if (new_hit.suv.x < hit.suv.x) {
                        hit = new_hit;
                    }
                }
            }
        } else {
            if (dist0 < dist1) {
                if (dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
            } else {
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
                if (dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
            }
        }
    }
    // Return hit object
    return hit;
}

// Simplified rayTracer to only test if ray intersects anything
fn shadowTraverseTriangleBVH(instance_index: u32, ray: Ray, l: f32) -> bool {
    // Maximal distance a triangle can be away from the ray origin
    let instance_uint_offset = instance_index * INSTANCE_UINT_SIZE;

    let inverse_transform: Transform = instance_transform[instance_index * 2u + 1u];
    let inverse_dir = inverse_transform.rotation * ray.unit_direction;

    let t_ray = Ray(
        inverse_transform.rotation * (ray.origin + inverse_transform.shift),
        normalize(inverse_dir)
    );
    let max_len: f32 = length(inverse_dir) * l;

    let instance_bvh_offset: u32 = instance_uint[instance_uint_offset + 1u];
    let instance_vertex_offset: u32 = instance_uint[instance_uint_offset + 2u];
    
    var stack: array<u32, 24> = array<u32, 24>();
    var stack_index: u32 = 1u;
    
    while (stack_index > 0u) {
        stack_index -= 1u;
        let node_index: u32 = stack[stack_index];

        let bvh_offset: u32 = instance_bvh_offset + node_index * BVH_TRIANGLE_SIZE;
        let vertex_offset: u32 = instance_vertex_offset + node_index * TRIANGLE_BOUNDING_VERTICES_SIZE;

        let indicator_and_children: vec3<u32> = access_triangle_bvh(bvh_offset).xyz;

        let bv0 = access_triangle_bounding_vertices(vertex_offset);
        let bv1 = access_triangle_bounding_vertices(vertex_offset + 1u);

        if (indicator_and_children.x == 0u) {
            let bv2 = access_triangle_bounding_vertices(vertex_offset + 2u);

            let a0 = bv0.xyz;
            let b0 = vec3<f32>(bv0.w, bv1.xy);
            let c0 = vec3<f32>(bv1.zw, bv2.x);
            if (moellerTrumboreCull(a0, b0, c0, t_ray, max_len)) {
                return true;
            }

            if (indicator_and_children.y != UINT_MAX) {
                let bv3 = access_triangle_bounding_vertices(vertex_offset + 3u);
                let bv4 = access_triangle_bounding_vertices(vertex_offset + 4u);
                let a1 = bv2.yzw;
                let b1 = bv3.xyz;
                let c1 = vec3<f32>(bv3.w, bv4.xy);
                if (moellerTrumboreCull(a1, b1, c1, t_ray, max_len)) {
                    return true;
                }   
            }
        } else {
            let min0 = bv0.xyz;
            let max0 = vec3<f32>(bv0.w, bv1.xy);
            let dist0: f32 = rayBoundingVolume(min0, max0, t_ray, max_len);

            var dist1: f32 = POW32;
            if (indicator_and_children.z != UINT_MAX) {
                let bv2 = access_triangle_bounding_vertices(vertex_offset + 2u);
                let min1 = vec3<f32>(bv1.zw, bv2.x);
                let max1 = bv2.yzw;
                dist1 = rayBoundingVolume(min1, max1, t_ray, max_len);
            }

            if (dist0 < dist1) {
                if (indicator_and_children.z != UINT_MAX && dist1 != POW32) {
                    stack[stack_index] = indicator_and_children.z;
                    stack_index += 1u;
                }
                if (dist0 != POW32) {
                    stack[stack_index] = indicator_and_children.y;
                    stack_index += 1u;
                }
            } else {
                if (dist0 != POW32) {
                    stack[stack_index] = indicator_and_children.y;
                    stack_index += 1u;
                }
                if (indicator_and_children.z != UINT_MAX && dist1 != POW32) {
                    stack[stack_index] = indicator_and_children.z;
                    stack_index += 1u;
                }
            }
        }
    }
    
    // If nothing was hit, return false (not in shadow)
    return false;
}

// Simplified rayTracer to only test if ray intersects anything
fn shadowTraverseInstanceBVH(ray: Ray, l: f32) -> bool {
    // Get texture size as max iteration value
    var stack = array<u32, 16>();
    var stack_index: u32 = 1u;

    while (stack_index > 0u) {
        stack_index -= 1u;
        let node_index: u32 = stack[stack_index];

        let bvh_offset: u32 = node_index * BVH_INSTANCE_SIZE;
        let vertex_offset: u32 = node_index * INSTANCE_BOUNDING_VERTICES_SIZE;
        
        let indicator_and_children: vec3<u32> = instance_bvh[bvh_offset];

        let child0: u32 = indicator_and_children.y;
        let child1: u32 = indicator_and_children.z;

        let min0 = instance_bounding_vertices[vertex_offset];
        let max0 = instance_bounding_vertices[vertex_offset + 1u];
        let dist0 = rayBoundingVolume(min0, max0, ray, l);
        
        
        var dist1: f32 = POW32;
        if (child1 != UINT_MAX) {
            let min1 = instance_bounding_vertices[vertex_offset + 2u];
            let max1 = instance_bounding_vertices[vertex_offset + 3u];
            dist1 = rayBoundingVolume(min1, max1, ray, l);
        }

        if (indicator_and_children.x == 0u) {
            if (dist0 < dist1) {
                if (dist1 != POW32) {
                    if (shadowTraverseTriangleBVH(child1, ray, l)) {
                        return true;
                    }
                }
                if (dist0 != POW32) {
                    if (shadowTraverseTriangleBVH(child0, ray, l)) {
                        return true;
                    }
                }
            } else {
                if (dist0 != POW32) {
                    if (shadowTraverseTriangleBVH(child0, ray, l)) {
                        return true;
                    }
                }
                if (dist1 != POW32) {
                    if (shadowTraverseTriangleBVH(child1, ray, l)) {
                        return true;
                    }
                }
            }
        } else {
            if (dist0 < dist1) {
                if (dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
            } else {
                if (dist0 != POW32) {
                    stack[stack_index] = child0;
                    stack_index += 1u;
                }
                if (dist1 != POW32) {
                    stack[stack_index] = child1;
                    stack_index += 1u;
                }
            }
        }
    }
    // If nothing was hit, return false (not in shadow)
    return false;
}

fn trowbridgeReitz(alpha: f32, n_dot_h: f32) -> f32 {
    let numerator: f32 = alpha * alpha;
    let denom: f32 = n_dot_h * n_dot_h * (numerator - 1.0f) + 1.0f;
    return numerator / max(PI * denom * denom, BIAS);
}

fn schlickBeckmann(alpha: f32, n_dot_x: f32) -> f32 {
    let k: f32 = alpha * 0.5f;
    let denom: f32 = max(n_dot_x * (1.0f - k) + k, BIAS);
    return n_dot_x / denom;
}

fn smith(alpha: f32, n_dot_v: f32, n_dot_l: f32) -> f32 {
    return schlickBeckmann(alpha, n_dot_v) * schlickBeckmann(alpha, n_dot_l);
}

fn fresnel(f0: vec3<f32>, theta: f32) -> vec3<f32> {
    // Use Schlick approximation
    return f0 + (1.0f - f0) * pow(1.0f - theta, 5.0f);
}

fn forwardTrace(material: Material, light_dir: vec3<f32>, light_color: vec3<f32>, light_intensity: f32, n: vec3<f32>, v: vec3<f32>) -> vec3<f32> {
    let len_p1: f32 = 1.0f + length(light_dir);
    // Apply inverse square law
    let brightness: vec3<f32> = light_color * light_intensity / (len_p1 * len_p1);

    let l: vec3<f32> = normalize(light_dir);
    let h: vec3<f32> = normalize(v + l);

    let v_dot_h: f32 = max(dot(v, h), 0.0f);
    let n_dot_l: f32 = max(dot(n, l), 0.0f);
    let n_dot_h: f32 = max(dot(n, h), 0.0f);
    let n_dot_v: f32 = max(dot(n, v), 0.0f);

    let alpha: f32 = material.roughness * material.roughness;
    let brdf: f32 = mix(1.0f, n_dot_v, material.metallic);
    let f0: vec3<f32> = material.albedo * brdf;

    let ks: vec3<f32> = fresnel(f0, v_dot_h);
    let kd: vec3<f32> = (1.0f - ks) * (1.0f - material.metallic);
    let lambert: vec3<f32> = material.albedo * INV_PI;

    let cook_torrance_numerator: vec3<f32> = ks * trowbridgeReitz(alpha, n_dot_h) * smith(alpha, n_dot_v, n_dot_l);
    let cook_torrance_denominator: f32 = max(4.0f * n_dot_v * n_dot_l, BIAS);

    let cook_torrance: vec3<f32> = cook_torrance_numerator / cook_torrance_denominator;
    let radiance: vec3<f32> = kd * lambert + cook_torrance;

    // Outgoing light to camera
    return radiance * n_dot_l * brightness;
}

fn reservoirSample(material: Material, camera_ray: Ray, random_vec: vec4<f32>, n: vec3<f32>, geometry_offset: f32) -> vec3<f32> {
    var local_color: vec3<f32> = vec3<f32>(0.0f);
    var reservoir_length: f32 = 0.0f;
    var total_weight: f32 = 0.0f;
    var reservoir_num: u32 = 0u;
    var reservoir_weight: f32 = 0.0f;
    var reservoir_dir: vec3<f32>;
    var last_random: vec2<f32> = noise(random_vec.zw, BIAS).xy;

    let size: u32 = u32(arrayLength(&lights));
    for (var j: u32 = 0u; j < size; j++) {

        let light_offset: u32 = j * POINT_LIGHT_SIZE;
        // Read light from storage buffer
        var light_position = vec3<f32>(lights[light_offset], lights[light_offset + 1u], lights[light_offset + 2u]);
        let light_color = vec3<f32>(lights[light_offset + 3u], lights[light_offset + 4u], lights[light_offset + 5u]);
        let light_intensity = lights[light_offset + 6u];
        let light_variance = lights[light_offset + 7u];
        // Skip if strength is negative or zero
        if (light_intensity <= 0.0f) {
            continue;
        }
        // Increment light weight
        reservoir_length += 1.0f;
        // Alter light source position according to variation.
        light_position += random_vec.xyz * light_variance;
        let dir: vec3<f32> = light_position - camera_ray.origin;

        let color_for_light: vec3<f32> = forwardTrace(material, dir, light_color, light_intensity, n, - camera_ray.unit_direction);

        local_color += color_for_light;
        let weight: f32 = length(color_for_light);

        total_weight += weight;
        if (abs(last_random.y) * total_weight <= weight) {
            reservoir_num = j;
            reservoir_weight = weight;
            reservoir_dir = dir;
        }
        // Update pseudo random variable.
        last_random = noise(last_random, BIAS + f32(uniforms_uint.temporal_target)).zw;
    }

    let unit_light_dir: vec3<f32> = normalize(reservoir_dir);
    // Compute quick exit criterion to potentially skip expensive shadow test
    let show_color: bool = reservoir_length == 0.0f || reservoir_weight == 0.0f;
    let show_shadow: bool = dot(n, unit_light_dir) <= BIAS;
    // Apply emissive texture and ambient light
    let base_luminance: vec3<f32> = material.emissive;
    // Test if in shadow
    
    if (show_color) {
        return local_color + base_luminance;
    }

    if (show_shadow) {
        return base_luminance;
    }
    // Apply geometry offset
    let offset_target: vec3<f32> = camera_ray.origin + geometry_offset * n;
    let light_ray: Ray = Ray(offset_target, unit_light_dir);

    // return local_color + base_luminance;
    
    if (shadowTraverseInstanceBVH(light_ray, length(reservoir_dir))) {
        return base_luminance;
    } else {
        return local_color + base_luminance;
    }
}



fn lightTrace(init_hit: Hit, origin: vec3<f32>, camera: vec3<f32>, clip_space: vec2<f32>, cos_sample_n: f32) -> vec3<f32> {
    // Use additive color mixing technique, so start with black
    var final_color: vec3<f32> = vec3<f32>(0.0f);
    var importancy_factor: vec3<f32> = vec3(1.0f);
    // originalColor = vec3(1.0f);
    var hit: Hit = init_hit;
    var ray: Ray = Ray(camera, normalize(origin - camera));
    var last_hit_point: vec3<f32> = camera;
    // Iterate over each bounce and modify color accordingly
    for (var i: u32 = 0u; i < uniforms_uint.max_reflections && length(importancy_factor) >= uniforms_float.min_importancy * SQRT3; i++) {
        let instance_uint_offset: u32 = hit.instance_index * INSTANCE_UINT_SIZE;
        let triangle_offset: u32 = hit.triangle_index * TRIANGLE_SIZE;


        let t0: vec4<f32> = access_triangle(triangle_offset);
        let t1: vec4<f32> = access_triangle(triangle_offset + 1u);
        let t2: vec4<f32> = access_triangle(triangle_offset + 2u);
        let t3: vec4<f32> = access_triangle(triangle_offset + 3u);
        let t4: vec4<f32> = access_triangle(triangle_offset + 4u);
        let t5: vec4<f32> = access_triangle(triangle_offset + 5u);
        // Fetch triangle coordinates from scene graph texture
        let relative_t: mat3x3<f32> = mat3x3<f32>(
            vec3<f32>(t0.xyz),
            vec3<f32>(t0.w, t1.xy),
            vec3<f32>(t1.zw, t2.x)
        );

        let transform: Transform = instance_transform[hit.instance_index * 2u];
        // Transform triangle
        let t: mat3x3<f32> = transform.rotation * relative_t;
        // Transform hit point
        ray.origin = hit.suv.x * ray.unit_direction + ray.origin;
        let offset_ray_target: vec3<f32> = ray.origin - transform.shift;
        
        let geometry_n: vec3<f32> = normalize(cross(t[0] - t[1], t[0] - t[2]));
        let diffs: vec3<f32> = vec3<f32>(
            distance(offset_ray_target, t[0]),
            distance(offset_ray_target, t[1]),
            distance(offset_ray_target, t[2])
        );
        // Pull normals
        let normals: mat3x3<f32> = transform.rotation * mat3x3<f32>(
            vec3<f32>(t2.yzw),
            vec3<f32>(t3.xyz),
            vec3<f32>(t3.w, t4.xy)
        );
        // Calculate barycentric coordinates
        let uvw: vec3<f32> = vec3(1.0 - hit.suv.y - hit.suv.z, hit.suv.y, hit.suv.z);
        // Interpolate smooth normal
        var smooth_n: vec3<f32> = normalize(normals * uvw);
        // to prevent unnatural hard shadow / reflection borders due to the difference between the smooth normal and geometry
        let angles: vec3<f32> = acos(abs(geometry_n * normals));
        let angle_tan: vec3<f32> = clamp(tan(angles), vec3<f32>(0.0f), vec3<f32>(1.0f));
        let geometry_offset: f32 = dot(diffs * angle_tan, uvw);
        // Interpolate final barycentric texture coordinates between UV's of the respective vertices
        
        let barycentric: vec2<f32> = mat3x2<f32>(
            vec2<f32>(t4.zw),
            vec2<f32>(t5.xy),
            vec2<f32>(t5.zw)
        ) * uvw;
        
        // Gather material attributes (albedo, roughness, metallicity, emissiveness, translucency, particel density and optical density aka. IOR) out of world texture
        /*
        let tex_num: vec3<f32>          = vec3<f32>(scene[index_s + 15], scene[index_s + 16], scene[index_s + 17]);

        let albedo_default: vec3<f32>   = vec3<f32>(scene[index_s + 18], scene[index_s + 19], scene[index_s + 20]);
        let rme_default: vec3<f32>      = vec3<f32>(scene[index_s + 21], scene[index_s + 22], scene[index_s + 23]);
        let tpo_default: vec3<f32>      = vec3<f32>(scene[index_s + 24], scene[index_s + 25], scene[index_s + 26]);

        let material: Material = Material (
            fetchTexVal(texture_atlas, barycentric, tex_num.x, albedo_default),
            fetchTexVal(pbr_atlas, barycentric, tex_num.y, rme_default),
            fetchTexVal(translucency_atlas, barycentric, tex_num.z, tpo_default),
        );
        */
        // Sample material
        let material: Material = instance_material[hit.instance_index];
        /*
        let material: Material = Material(
            // Albedo
            vec3<f32>(1.0f, 1.0f, 1.0f),
            // Emissive
            vec3<f32>(0.0f, 0.0f, 0.0f),
            // Roughness
            0.5f,
            // Metallic
            0.0f,
            // Transmission
            0.0f,
            // IOR
            1.5f
        );
        
        */
        ray = Ray(ray.origin, normalize(ray.origin - last_hit_point));
        // If ray reflects from inside or onto an transparent object,
        // the surface faces in the opposite direction as usual
        var sign_dir: f32 = sign(dot(ray.unit_direction, smooth_n));
        smooth_n *= - sign_dir;

        // Generate pseudo random vector
        let fi: f32 = f32(i);
        let random_vec: vec4<f32> = noise(clip_space.xy * length(ray.origin - last_hit_point), fi + cos_sample_n * PHI);
        let random_spheare_vec: vec3<f32> = normalize(smooth_n + normalize(random_vec.xyz));
        let brdf: f32 = mix(1.0f, abs(dot(smooth_n, ray.unit_direction)), material.metallic);

        // Alter normal according to roughness value
        let roughness_brdf: f32 = material.roughness * brdf;
        let rough_n: vec3<f32> = normalize(mix(smooth_n, random_spheare_vec, roughness_brdf));

        let h: vec3<f32> = normalize(rough_n - ray.unit_direction);
        let v_dot_h = max(dot(- ray.unit_direction, h), 0.0f);
        let f0: vec3<f32> = material.albedo * brdf;
        let f: vec3<f32> = fresnel(f0, v_dot_h);

        let fresnel_reflect: f32 = max(f.x, max(f.y, f.z));
        // object is solid or translucent by chance because of the fresnel effect
        let is_solid: bool = material.transmission * fresnel_reflect <= abs(random_vec.w);
        // Determine local color considering PBR attributes and lighting
        let local_color: vec3<f32> = reservoirSample(material, ray, random_vec, - sign_dir * smooth_n, geometry_offset);
        // Calculate primary light sources for this pass if ray hits non translucent object
        final_color += local_color * importancy_factor;
        // Multiply albedo with either absorption value or filter color
        importancy_factor = importancy_factor * material.albedo;
        // Test for early termination
        if (i + 1u >= uniforms_uint.max_reflections || length(importancy_factor) < uniforms_float.min_importancy * SQRT3) {
            break;
        }
        // Handle translucency and skip rest of light calculation
        if(is_solid) {
            // Calculate reflecting ray
            ray.unit_direction = normalize(mix(reflect(ray.unit_direction, smooth_n), random_spheare_vec, roughness_brdf));
        } else {
            let eta: f32 = mix(1.0f / material.ior, material.ior, max(sign_dir, 0.0f));
            // Refract ray depending on IOR (material.tpo.z)
            ray.unit_direction = normalize(mix(refract(ray.unit_direction, smooth_n, eta), random_spheare_vec, roughness_brdf));
        }
        
        // Calculate next intersection
        hit = traverseInstanceBVH(ray);
        // Stop loop if there is no intersection and ray goes in the void
        if (hit.instance_index == UINT_MAX) {
            break;
        }
        // Update other parameters
        last_hit_point = ray.origin;
        
        
    }
    // Return final pixel color
    return final_color + importancy_factor * uniforms_float.ambient;
}


@compute
@workgroup_size(8, 8)
fn compute(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
    @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    // Get texel position of screen
    let screen_pos: vec2<u32> = global_invocation_id.xy;
    let buffer_index: u32 = global_invocation_id.x + uniforms_uint.render_size.x * global_invocation_id.y;

    // Get based clip space coordinates (with 0.0 at upper left corner)
    // Load attributes from fragment shader out ofad(texture_triangle_id, screen_pos).x;
    // Subtract 1 to have 0 as invalid index
    let instance_index: u32 = texture_offset[buffer_index * 2u] - 1u;
    let triangle_index: u32 = texture_offset[buffer_index * 2u + 1u] - 1u;

    if (instance_index == UINT_MAX && triangle_index == UINT_MAX) {
        // If there is no triangle render ambient color 
        textureStore(compute_out, screen_pos, 0, vec4<f32>(uniforms_float.ambient, 1.0f));
        // And overwrite position with 0 0 0 0
        if (uniforms_uint.is_temporal == 1u) {
            // Store position in target
            textureStore(compute_out, screen_pos, 1, vec4<f32>(0.0f));
        }
        return;
    }
    
    let absolute_position: vec3<f32> = textureLoad(texture_absolute_position, screen_pos, 0).xyz;
    let uv: vec2<f32> = textureLoad(texture_uv, screen_pos, 0).xy;

    let clip_space: vec2<f32> = vec2<f32>(screen_pos) / vec2<f32>(num_workgroups.xy * 8u);
    let uvw: vec3<f32> = vec3<f32>(uv, 1.0f - uv.x - uv.y);
    // Generate hit struct for pathtracer
    let init_hit: Hit = Hit(vec3<f32>(distance(absolute_position, uniforms_float.camera_position), uvw.yz), instance_index, triangle_index);
    // let camera_ray: Ray = Ray(absolute_position, - normalize(uniforms_float.camera_position - absolute_position));

    // Determine if additional samples are needed
    var sampleFactor: u32 = 1u;
    
    if (uniforms_uint.is_temporal == 1u) {
        // Get count of shifted texture
        // Extract 3d position value
        let fine_color_acc: vec4<f32> = textureLoad(shift_out, screen_pos, 0, 0);
        // let coarse_color_acc: vec4<f32> = textureLoad(shift_out, screen_pos, 1, 0);
        let fine_color_low_variance_acc: vec4<f32> = textureLoad(shift_out, screen_pos, 2, 0);
        // let coarse_color_low_variance_acc: vec4<f32> = textureLoad(shift_out, screen_pos, 3, 0);
        let position_old: vec4<f32> = textureLoad(shift_out, screen_pos, 4, 0);
        
        // If absolute position is all zeros then there is nothing to do
        let dist: f32 = distance(absolute_position, position_old.xyz);
        let cur_depth: f32 = distance(absolute_position, uniforms_float.camera_position.xyz);
        // let norm_color_diff = dot(normalize(current_color.xyz), normalize(accumulated_color.xyz));

        let last_frame = position_old.w == f32(uniforms_uint.temporal_target);
        let fine_count: f32 = fine_color_low_variance_acc.w;

        if (fine_count == 0.0f || !last_frame) {
            sampleFactor = 2u;
        }
        
        let temporal_target_mod: u32 = (uniforms_uint.temporal_target + (workgroup_id.x * 8u) / (uniforms_uint.render_size.x / 3u)) % 3u;

        if (
            dist <= cur_depth * 8.0f / f32(uniforms_uint.render_size.x)
            && last_frame
            // Only keep old pixel if accumulation is saturated
            && fine_count >= 4.0f
            // Recalculate every third frame anyways to detect change in reflection
            && temporal_target_mod != 0u
        ){
            textureStore(compute_out, screen_pos, 0, fine_color_acc);
            // Store position in target
            textureStore(compute_out, screen_pos, 1, vec4<f32>(absolute_position, 1.0f));
            return;
        }
        
    }

    var final_color = vec3<f32>(0.0f);
    // Generate multiple samples
    for(var i: u32 = 0u; i < uniforms_uint.samples * sampleFactor; i++) {
        // Use cosine as noise in random coordinate picker
        let cos_sample_n = cos(f32(i));
        // let random_vec: vec4<f32> = noise(clip_space.xy * length(uniforms_float.camera_position - absolute_position), f32(i) + cos_sample_n * PHI);
        // final_color += reservoirSample(material, camera_ray, random_vec, normal, normal, 0.0f);
        final_color += lightTrace(init_hit, absolute_position, uniforms_float.camera_position, clip_space, cos_sample_n);
        // fn forwardTrace(material: Material, light: Light, origin: vec3<f32>, n: vec3<f32>, v: vec3<f32>) -> vec3<f32> {
        // final_color += forwardTrace(material, light_position - absolute_position, light_color, light_intensity, normal, normalize(uniforms_float.camera_position - absolute_position));
        // lightTrace(init_hit, absolute_position, uniforms.camera_position, clip_space, cos_sample_n, uniforms.max_reflections);
    }

    // Average ray colors over samples.
    let inv_samples: f32 = 1.0f / f32(uniforms_uint.samples * sampleFactor);
    final_color *= inv_samples;

    // Write to additional textures for temporal pass
    if (uniforms_uint.is_temporal == 1u) {
        // Render to compute target
        textureStore(compute_out, screen_pos, 0, vec4<f32>(final_color, 1.0f));
        // Store position in target
        textureStore(compute_out, screen_pos, 1, vec4<f32>(absolute_position, 1.0f));
    } else {
        // Render to compute target
        textureStore(compute_out, screen_pos, 0, vec4<f32>(final_color, 1.0f));
    }
    
    // textureStore(compute_out, screen_pos, 0, vec4<f32>(1.0f, 0.0f, 0.0f, 1.0f));
}
