import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'

// A fixed, texture-free lighting model for the original-style laboratory kit.
// Instancing and model normals remain real 3D; no PBR/WebGPU shader roster is needed.
const vertexSource=`
precision highp float;
attribute vec3 position; attribute vec3 normal;
uniform mat4 world; uniform mat4 viewProjection;
#ifdef INSTANCES
attribute vec4 world0; attribute vec4 world1; attribute vec4 world2; attribute vec4 world3;
#endif
varying vec3 vNormal; varying vec3 vPosition;
void main(){
  mat4 model=world;
  #ifdef INSTANCES
  model=mat4(world0,world1,world2,world3);
  #endif
  vNormal=normalize(mat3(model)*normal);
  vPosition=(model*vec4(position,1.0)).xyz;
  gl_Position=viewProjection*model*vec4(position,1.0);
}`
const fragmentSource=`
precision highp float;
uniform vec3 baseColor; uniform float glow; uniform vec3 eyePosition; uniform float metallic; uniform float roughness;
varying vec3 vNormal; varying vec3 vPosition;
void main(){
  vec3 n=normalize(vNormal);
  float diffuse=max(0.0,dot(n,normalize(vec3(-0.65,0.85,0.5))));
  float rim=pow(max(0.0,dot(n,normalize(vec3(0.4,0.9,-0.4)))),20.0)*0.035;
  vec3 halfVector=normalize(normalize(vec3(-0.45,0.85,0.35))+normalize(eyePosition-vPosition));
  float specular=pow(max(0.0,dot(n,halfVector)),mix(95.0,8.0,roughness))*(1.0-roughness)*0.5;
  float contact=mix(mix(0.68,1.0,smoothstep(-0.06,0.22,vPosition.y)),1.0,max(0.0,n.y));
  vec3 color=baseColor*(0.40+0.65*diffuse)*contact+mix(vec3(specular),baseColor*specular,metallic)+vec3(rim)+baseColor*glow;
  gl_FragColor=vec4(color,1.0);
}`
export function classicMaterial(scene:Scene,name:string,color:Color3,glow=0,metallic=.1,roughness=.65) {
  const material=new ShaderMaterial(name,scene,{vertexSource,fragmentSource},{attributes:['position','normal'],uniforms:['world','viewProjection','baseColor','glow','eyePosition','metallic','roughness']})
  material.setColor3('baseColor',color);material.setFloat('glow',glow);material.setFloat('metallic',metallic);material.setFloat('roughness',roughness)
  material.onBindObservable.add(()=>{if(scene.activeCamera)material.setVector3('eyePosition',scene.activeCamera.globalPosition)})
  material.backFaceCulling=false
  return material
}
