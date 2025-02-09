const TRIANGLE_SIZE: u32 = 6u;

const INSTANCE_UINT_SIZE: u32 = 9u;

const PI: f32 = 3.141592653589793;
const PHI: f32 = 1.61803398874989484820459;
const SQRT3: f32 = 1.7320508075688772;
const POW32: f32 = 4294967296.0;
const POW23M1: f32 = 8388607.0;
const POW23M1U: u32 = 8388607u;
const BIAS: f32 = 0.0000152587890625;
const INV_PI: f32 = 0.3183098861837907;
const INV_255: f32 = 0.00392156862745098;
const UINT_MAX: u32 = 4294967295u;

struct Transform {
    rotation: mat3x3<f32>,
    shift: vec3<f32>
};

struct UniformFloat {
    view_matrix: mat3x3<f32>,
    inv_view_matrix: mat3x3<f32>,

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

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) absolute_position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) clip_space: vec3<f32>
};

// DepthBindGroup
@group(0) @binding(0) var<storage, read_write> depth_buffer: array<atomic<u32>>;

// RasterGeometryBindGroup
@group(1) @binding(0) var triangles: texture_2d_array<f32>;

// RasterDynamicBindGroup
@group(2) @binding(0) var<uniform> uniform_float: UniformFloat;
@group(2) @binding(1) var<uniform> uniform_uint: UniformUint;
@group(2) @binding(2) var<storage, read> instance_uint: array<u32>;
@group(2) @binding(3) var<storage, read> instance_transform: array<Transform>;


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

fn binary_search_instance(triangle_index: u32) -> u32 {
    var left: u32 = 0u;
    var right: u32 = arrayLength(&instance_uint) / INSTANCE_UINT_SIZE;
    
    while (left + 1u < right) {
        let mid: u32 = left + (right - left) / 2u;
        let start_index: u32 = instance_uint[mid * INSTANCE_UINT_SIZE + 8u];
        
        if (start_index <= triangle_index) {
            left = mid;
        } else {
            right = mid;
        }
    }
    
    return left;
}

@vertex
fn vertex(
    @builtin(vertex_index) global_vertex_index: u32,
    @builtin(instance_index) triangle_index: u32
) -> VertexOut {
    var out: VertexOut;
    let vertex_num: u32 = global_vertex_index % 3u;

    let instance_index: u32 = binary_search_instance(triangle_index);
    let instance_uint_offset: u32 = instance_index * INSTANCE_UINT_SIZE;

    let triangle_instance_offset: u32 = instance_uint[instance_uint_offset];
    let triangle_index_offset: u32 = instance_uint[instance_uint_offset + 8u];
    let triangle_offset: u32 = triangle_instance_offset + (triangle_index - triangle_index_offset) * TRIANGLE_SIZE;

    var relative_position: vec3<f32>;
    // Set uv to vertex uv and let the vertex interpolation generate the values in between
    switch (vertex_num) {
        case 0u: {
            relative_position = access_triangle(triangle_offset).xyz;
            out.uv = vec2<f32>(1.0f, 0.0f);
        }
        case 1u: {
            relative_position = vec3<f32>(access_triangle(triangle_offset).w, access_triangle(triangle_offset + 1u).xy);
            out.uv = vec2<f32>(0.0f, 1.0f);
        }
        default: {
            relative_position = vec3<f32>(access_triangle(triangle_offset + 1u).zw, access_triangle(triangle_offset + 2u).x);
            out.uv = vec2<f32>(0.0f, 0.0f);
        }
    }
    // Trasform position
    let transform: Transform = instance_transform[instance_index * 2u];
    out.absolute_position = transform.rotation * relative_position + transform.shift;

    out.clip_space = uniform_float.view_matrix * (out.absolute_position - uniform_float.camera_position);
    // Set triangle position in clip space
    out.pos = vec4<f32>(out.clip_space.xy, 0.0, out.clip_space.z);
    
    return out;
}

// FRAGMENT SHADER ------------------------------------------------------------------------------------------------------------------------

@fragment
fn fragment(
    @location(0) absolute_position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) clip_space: vec3<f32>
) -> @location(0) vec4<f32> {

    // Get canvas size
    let screen_space: vec2<f32> = (clip_space.xy / clip_space.z) * 0.5 + 0.5;
    let coord: vec2<u32> = vec2<u32>(
        u32(f32(uniform_uint.render_size.x) * screen_space.x),
        u32(f32(uniform_uint.render_size.y)  * (1.0 - screen_space.y))
    );

    let buffer_index: u32 = coord.x + uniform_uint.render_size.x * coord.y;
    // Only save if texel is closer to camera then previously
    let current_depth: u32 = UINT_MAX - bitcast<u32>(clip_space.z); //POW23M1U - u32(POW23M1 / (1.0f + exp(- clip_space.z * INV_255)));
    // Store in texture
    atomicMax(&depth_buffer[buffer_index], current_depth);
    // Return meaningless value, as this shader is only used to populate the atomic depth buffer.
    return vec4<f32>(1.0f);
}
