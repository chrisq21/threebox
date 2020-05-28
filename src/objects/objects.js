var utils = require("../utils/utils.js");
var material = require("../utils/material.js");
const THREE = require('../three.js');

const AnimationManager = require("../animation/AnimationManager.js");
const CSS2D = require("./CSS2DRenderer.js");


function Objects(){

}

Objects.prototype = {

	// standard 1px line with gl
	line: function (obj) {

		obj = utils._validate(obj, this._defaults.line);

		//project to world and normalize
		var straightProject = utils.lnglatsToWorld(obj.geometry);
		var normalized = utils.normalizeVertices(straightProject);

		//flatten array for buffergeometry
		var flattenedArray = utils.flattenVectors(normalized.vertices);

		var positions = new Float32Array(flattenedArray); // 3 vertices per point
		var geometry = new THREE.BufferGeometry();
		geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));

		// material
		var material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 21 });
		var line = new THREE.Line(geometry, material);

		line.options = options || {};
		line.position.copy(normalized.position)

		return line
	},

	extrusion: function (options) {

	},

	_addMethods: function (obj, static) {

		var root = this;

		if (static) {

		}

		else {

			if (!obj.coordinates) obj.coordinates = [0, 0, 0];

			// Bestow this mesh with animation superpowers and keeps track of its movements in the global animation queue			
			root.animationManager.enroll(obj);

			obj.setCoords = function (lnglat) {

				/** Place the given object on the map, centered around the provided longitude and latitude
					The object's internal coordinates are assumed to be in meter-offset format, meaning
					1 unit represents 1 meter distance away from the provided coordinate.
				*/

				// If object already added, scale the model so that its units are interpreted as meters at the given latitude
				//[jscastro] this method could be needed more times
				if (obj.userData.units === 'meters') {
					var s = utils.projectedUnitsPerMeter(lnglat[1]);
					if (!s) { s = 1; };
					s = Number(s.toFixed(7));
					if (typeof s === 'number') obj.scale.set(s, s, s);
					else obj.scale.set(s.x, s.y, s.z);
					//initialize the object size and it will rescale the rest
				}

				obj.coordinates = lnglat;
				obj.set({ position: lnglat });
				return obj;

			}

			obj.setTranslate = function (lnglat) {

				obj.set({ translate: lnglat });
				return obj;

			}

			obj.setRotation = function (xyz) {

				if (typeof xyz === 'number') xyz = { z: xyz }

				var r = {
					x: utils.radify(xyz.x) || obj.rotation.x,
					y: utils.radify(xyz.y) || obj.rotation.y,
					z: utils.radify(xyz.z) || obj.rotation.z
				}

				obj._setObject({ rotation: [r.x, r.y, r.z] })
			}

			//[jscastro] added method to adjust 3D models to their issues with center position for rotation
			obj.calculateAdjustedPosition = function (lnglat, xyz, inverse) {

				let location = lnglat.slice();

				//we convert the units to Long/Lat/Height
				let newCoords = utils.unprojectFromWorld(obj.modelSize);

				if (inverse) {
					//each model will have different adjustment attributes, we add them for x, y, z
					location[0] -= (xyz.x != 0 ? (newCoords[0] / xyz.x) : 0);
					location[1] -= (xyz.y != 0 ? (newCoords[1] / xyz.y) : 0);
					location[2] -= (xyz.z != 0 ? (newCoords[2] / xyz.z) : 0);
				} else {
					//each model will have different adjustment attributes, we add them for x, y, z
					location[0] += (xyz.x != 0 ? (newCoords[0] / xyz.x) : 0);
					location[1] += (xyz.y != 0 ? (newCoords[1] / xyz.y) : 0);
					location[2] += (xyz.z != 0 ? (newCoords[2] / xyz.z) : 0);

				}
				return location;
			}

			//[jscastro] added method to rotate on objects on an axis instead of centers
			obj.setRotationAxis = function (xyz) {
				if (typeof xyz === 'number') xyz = { z: xyz }

				let bb = obj.modelBox();

				let point = new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z);
				//apply Axis rotation on angle
				if (xyz.x != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.x);
				if (xyz.y != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.y);
				if (xyz.z != 0) _applyAxisAngle(obj, point, new THREE.Vector3(0, 0, 1), xyz.z);
			}

			//[jscastro] Auxiliar method to rotate an object on an axis
			function _applyAxisAngle(model, point, axis, degrees) {
				let theta = utils.radify(degrees);
				model.position.sub(point); // remove the offset
				model.position.applyAxisAngle(axis, theta); // rotate the POSITION
				model.position.add(point); // re-add the offset
				model.rotateOnAxis(axis, theta)

				map.repaint = true;
			}

			let _boundingBox;
			//[jscastro] added property for boundingBox helper
			Object.defineProperty(obj, 'boundingBox', {
				get() { return _boundingBox; },
				set(value) {
					_boundingBox = value;
				}
			})

			let _boundingBoxShadow;
			//[jscastro] added property for boundingBox helper
			Object.defineProperty(obj, 'boundingBoxShadow', {
				get() { return _boundingBoxShadow; },
				set(value) {
					_boundingBoxShadow = value;
				}
			})

			//[jscastro] added method to create a bounding box and a shadow box
			obj.drawBoundingBox = function () {
				//let's create 2 wireframes, one for the object and one to project on the floor position
				let bb = this.box3();
				//create the group to return
				let boxGrid = new THREE.Group();
				boxGrid.name = "BoxGrid";
				boxGrid.updateMatrixWorld(true);
				let boxModel = new THREE.Box3Helper(bb, new THREE.Color(0xff0000));
				boxModel.name = "BoxModel";
				boxGrid.add(boxModel);
				boxModel.layers.disable(0); // it makes the object invisible for the raycaster
				obj.boundingBox = boxModel;

				//it needs to clone, to avoid changing the object by reference
				let bb2 = bb.clone();
				//we make the second box flat and at the floor height level
				bb2.max.z = bb2.min.z;
				let boxShadow = new THREE.Box3Helper(bb2, new THREE.Color(0x000000));
				boxShadow.name = "BoxShadow";

				boxGrid.add(boxShadow);
				boxShadow.layers.disable(0); // it makes the object invisible for the raycaster
				obj.boundingBoxShadow = boxShadow;

				boxGrid.visible = false; // visibility is managed from the parent
				return boxGrid;
			}

			let _label;
			//[jscastro] added property for wireframes state
			Object.defineProperty(obj, 'label', {
				get() { return _label; },
				set(value) {
					_label = value;
				}
			})

			//[jscastro] add label method 
			obj.addLabel = function (HTMLElement, visible, bottomMargin) {
				//we add it to the first children to get same boxing and position
				//obj.children[0].add(obj.drawLabel(text, height));
				obj.children[0].add(obj.drawLabelHTML(HTMLElement, obj.modelHeight, visible, bottomMargin));
			}

			//[jscastro] draw label method can be invoked separately
			obj.drawLabelHTML = function (HTMLElement, height, visible, bottomMargin) {
				let div = document.createElement('div');
				div.className += ' label3D';
				// [jscastro] create a div [TODO] analize if must be moved
				if (typeof (HTMLElement) == 'string') {
					div.innerHTML = HTMLElement;
				} else {
					div.innerHTML = HTMLElement.outerHTML;
				}
				div.style.marginTop = '-' + bottomMargin + 'em';
				obj.label = new CSS2D.CSS2DObject(div);
				let p = obj.userData.feature.properties;
				let labelHeight = (p.label ? height / p.label : 0) + (height / 10); //if label correction adjust + 10%
				let size = obj.getSize();
				obj.label.position.set(-size.x / 2, -size.y / 2, size.z);//height + labelHeight);
				obj.label.visible = visible;
				obj.label.alwaysVisible = visible;

				return obj.label;
			}

			let _wireframe = false;
			//[jscastro] added property for wireframes state
			Object.defineProperty(obj, 'wireframe', {
				get() { return _wireframe; },
				set(value) {
					if (_wireframe != value) {

						obj.loadedModel.traverse(function (c) {
							if (c.type == "Mesh" || c.type == "SkinnedMesh" || c.type == "LineSegments") {
								let arrMaterial = [];
								if (!Array.isArray(c.material)) {
									arrMaterial.push(c.material);
								} else {
									arrMaterial = c.material;
								}
								arrMaterial.forEach(function (m) {
									m.opacity = (value ? 0.1 : 1);
									//m.transparent = value;
									m.wireframe = value;
								});
								if (c.type == "LineSegments") {
									c.layers.disableAll();
								} else {
									if (value) { c.layers.disable(0); c.layers.enable(1); } else { c.layers.disable(1); c.layers.enable(0); }
								};
							}
						});
						_wireframe = value;
						// Dispatch new event WireFramed
						obj.dispatchEvent(new CustomEvent('Wireframed', { detail: obj, bubbles: true, cancelable: true }));
					}
				}
			})

			let _selected = false;
			//[jscastro] added property for selected state
			Object.defineProperty(obj, 'selected', {
				get() { return _selected; },
				set(value) {
					if (value) {
						if (obj.boundingBox) {
							obj.boundingBox.material = Objects.prototype._defaults.materials.boxSelectedMaterial;
							obj.boundingBox.parent.visible = true;
							obj.boundingBox.layers.enable(1);
							obj.boundingBoxShadow.layers.enable(1);
						}
						if (obj.label && !obj.label.alwaysVisible) obj.label.visible = true;
					}
					else {
						if (obj.boundingBox) {
							obj.boundingBox.parent.visible = false;
							obj.boundingBox.layers.disable(1);
							obj.boundingBoxShadow.layers.disable(1);
							obj.boundingBox.material = Objects.prototype._defaults.materials.boxNormalMaterial;
						}
						if (obj.label && !obj.label.alwaysVisible) obj.label.visible = false;
					}
					//only fire the event if value is different
					if (_selected != value) {
						_selected = value;
						// Dispatch new event SelectedChange
						obj.dispatchEvent(new CustomEvent('SelectedChange', { detail: obj, bubbles: true, cancelable: true }));
					}
				}
			})

			let _over = false;
			//[jscastro] added property for over state
			Object.defineProperty(obj, 'over', {
				get() { return _over; },
				set(value) {
					if (value) {
						if (!obj.selected) {
							if (obj.boundingBox) {
								obj.boundingBox.material = Objects.prototype._defaults.materials.boxOverMaterial;
								obj.boundingBox.parent.visible = true;
								obj.boundingBox.layers.enable(1);
								obj.boundingBoxShadow.layers.enable(1);
							}
						}
						if (obj.label && !obj.label.alwaysVisible) { obj.label.visible = true; }
						// Dispatch new event ObjectOver
						obj.dispatchEvent(new CustomEvent('ObjectMouseOver', { detail: obj, bubbles: true, cancelable: true }));

					}
					else {
						if (!obj.selected) {
							if (obj.boundingBox) {
								obj.boundingBox.parent.visible = false;
								obj.boundingBox.layers.disable(1);
								obj.boundingBoxShadow.layers.disable(1);
								obj.boundingBox.material = Objects.prototype._defaults.materials.boxNormalMaterial;
							}
							if (obj.label && !obj.label.alwaysVisible) { obj.label.visible = false; }
						}
						// Dispatch new event ObjectOver
						obj.dispatchEvent(new CustomEvent('ObjectMouseOut', { detail: obj, bubbles: true, cancelable: true }));
					}
					_over = value;
				}
			})

			//[jscastro] get the object model Box3 in runtime
			obj.box3 = function () {
				//first box the object

				obj.updateMatrix();
				obj.updateMatrixWorld(true, true);

				let dup = obj.clone();
				dup.loadedModel = obj.loadedModel;
				//get the size of the loadedModel
				let bounds = new THREE.Box3().setFromObject(dup.loadedModel);

				//if the object has parent it's already in the added to world so it's scaled and it could be rotated
				if (obj.parent) {
					let m = new THREE.Matrix4();
					let rm = new THREE.Matrix4();
					let rmi = new THREE.Matrix4();
					obj.parent.matrixWorld.getInverse(m);
					obj.matrix.extractRotation(rm);
					rm.getInverse(rmi);
					dup.matrix = m;
					dup.updateMatrix();
					dup.setRotationFromMatrix(rmi);
					bounds = new THREE.Box3().setFromObject(dup);
				}

				return bounds;
			};

			//[jscastro] modelBox
			obj.modelBox = function () {
				return obj.box3();
			}

			obj.getSize = function () {
				return obj.box3().getSize(new THREE.Vector3(0, 0, 0));
			}

			//[jscastro]
			let _modelSize = false;
			//[jscastro] added property for wireframes state
			Object.defineProperty(obj, 'modelSize', {
				get() {
					_modelSize = obj.getSize();
					//console.log(_modelSize);
					return _modelSize;
				},
				set(value) {
					if (_modelSize != value) {
						_modelSize = value;
					}
				}
			})

			//[jscastro]
			obj.modelHeight = 0;

		}

		obj.add = function () {
			tb.add(obj);
			if (!static) obj.set({ position: obj.coordinates });
			return obj;
		}

		obj.remove = function () {
			tb.remove(obj);
			tb.map.repaint = true;
		}

		obj.duplicate = function () {
			var dupe = obj.clone();
			dupe.userData = obj.userData;
			root._addMethods(dupe);
			return dupe
		}

		return obj
	},

	_makeGroup: function (obj, options) {
		var geoGroup = new THREE.Group();
		geoGroup.userData = options || {};
		geoGroup.userData.isGeoGroup = true;
		geoGroup.userData.feature.properties.uuid = geoGroup.uuid;
		var isArrayOfObjects = obj.length;

		if (isArrayOfObjects) for (o of obj) geoGroup.add(o)


		else geoGroup.add(obj);

		utils._flipMaterialSides(obj);

		return geoGroup
	},

	animationManager: new AnimationManager,

	_defaults: {
		materials: {
			boxNormalMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(0xff0000) }),
			boxOverMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(0xffff00) }),
			boxSelectedMaterial: new THREE.LineBasicMaterial({ color: new THREE.Color(0x00ff00) })
		},

		line: {
			geometry: null,
			color: 'black',
			width: 1,
			opacity: 1
		},

		sphere: {
			position: [0, 0, 0],
			radius: 1,
			sides: 20,
			units: 'scene',
			material: 'MeshBasicMaterial'
		},

		tube: {
			geometry: null,
			radius: 1,
			sides: 6,
			material: 'MeshBasicMaterial'
		},

		extrusion: {
			footprint: null,
			base: 0,
			top: 100,
			color: 'black',
			material: 'MeshBasicMaterial',
			scaleToLatitude: false
		},

		loadObj: {
			type: '',
			obj: null,
			bin: null,
			units: 'scene',
			scale: 1,
			rotation: 0,
			feature: null
		},

		Object3D: {
			obj: null,
			units: 'scene'
		}
	},

	geometries: {
		line: ['LineString'],
		tube: ['LineString'],
		sphere: ['Point'],
	}
}

module.exports = exports = Objects;