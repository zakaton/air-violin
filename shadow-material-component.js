/* global AFRAME, THREE */
AFRAME.registerComponent("shadow-material", {
  init: function () {
    let el = this.el;
    let self = this;
    let mesh = el.getObject3D("mesh");
    console.log(mesh);
    if (!mesh) {
      return;
    }
    mesh.material = new THREE.ShadowMaterial();
    mesh.material.opacity = 1.0;
  },
});
