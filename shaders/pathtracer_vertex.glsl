#version 300 es
#define TRIANGLES_PER_ROW_POWER 8
#define TRIANGLES_PER_ROW 256
#define INV_65536 0.00001525879

precision highp int;
precision highp float;
precision highp sampler2D;

in int triangleId;
in int vertexId;

uniform vec3 cameraPosition;
uniform vec2 perspective;
uniform vec4 conf;

// Texture with vertex information about all triangles in scene
uniform sampler2D geometryTex;

out vec3 position;
out vec2 uv;
out vec3 clipSpace;

flat out vec3 camera;
flat out int fragmentTriangleId;

const mat4 identityMatrix = mat4(
    vec4(1.0f, 0.0f, 0.0f, 0.0f),
    vec4(0.0f, 1.0f, 0.0f, 0.0f),
    vec4(0.0f, 0.0f, 1.0f, 0.0f),
    vec4(0.0f, 0.0f, 0.0f, 1.0f)
);

const vec2 baseUVs[3] = vec2[3](
    vec2(1, 0), 
    vec2(0, 1), 
    vec2(0, 0)
);

vec3 clipPosition(vec3 pos, vec2 dir) {
    vec2 translatePX = vec2(pos.x * cos(dir.x) + pos.z * sin(dir.x), pos.z * cos(dir.x) - pos.x * sin(dir.x));
    vec2 translatePY = vec2(pos.y * cos(dir.y) + translatePX.y * sin(dir.y), translatePX.y * cos(dir.y) - pos.y * sin(dir.y));
    vec2 translate2d = vec2(translatePX.x / conf.y, translatePY.x) / conf.x;
    return vec3(translate2d, translatePY.y);
}

void main() {
    // Calculate vertex position in texture
    int triangleColumn = triangleId >> TRIANGLES_PER_ROW_POWER;
    ivec2 index = ivec2((triangleId - triangleColumn * TRIANGLES_PER_ROW) * 4, triangleColumn);

    // Read vertex position from texture
    vec3 position3d = texelFetch(geometryTex, index + ivec2(vertexId, 0), 0).xyz;

    vec3 move3d = position3d - cameraPosition;
    clipSpace = clipPosition(move3d, perspective + conf.zw);

    // Set triangle position in clip space
    gl_Position = vec4(clipSpace.xy, -1.0f / (1.0f + exp(- length(move3d * INV_65536))), clipSpace.z);
    position = position3d;

    uv = baseUVs[vertexId];
    camera = cameraPosition;
    fragmentTriangleId = triangleId;
}