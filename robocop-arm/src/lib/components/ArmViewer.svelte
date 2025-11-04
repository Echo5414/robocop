<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

	interface JointAngle {
		id: number;
		angle: number; // radians, relative to mechanical zero
	}

	type Axis = 'x' | 'y' | 'z';

	interface JointDefinition {
		id: number;
		axis: Axis;
		invert?: boolean;
		offset?: number; // radians added after mechanical zero to align visuals
		nodeName?: string; // optional GLTF node name
	}

	interface JointOverride extends Partial<Omit<JointDefinition, 'id'>> {
		id: number;
	}

	interface Props {
		jointAngles: JointAngle[];
		modelUrl?: string | null;
		modelScale?: number;
		jointOverrides?: JointOverride[];
		initialZoom?: number; // Zoom level as percentage (100 = default, 200 = 2x closer, 50 = 2x farther)
	}

	const DEFAULT_JOINTS: JointDefinition[] = [
		{ id: 1, axis: 'y', invert: true, nodeName: 'joint_base' },
		{ id: 2, axis: 'x', nodeName: 'joint_shoulder' },
		{ id: 3, axis: 'z', invert: true, nodeName: 'joint_elbow' },
		{ id: 4, axis: 'z', invert: true, nodeName: 'joint_wrist_roll' },
		{ id: 5, axis: 'z', invert: true, nodeName: 'joint_wrist_pitch' },
		{ id: 6, axis: 'y', nodeName: 'joint_gripper' }
	];

	let {
		jointAngles,
		modelUrl = '/models/so-101.glb',
		modelScale = 0.001,
		jointOverrides = [],
		initialZoom = 150 // Default: 150% zoom (1.5x closer than original)
	}: Props = $props();

	function buildJointDefinitions(): JointDefinition[] {
		return DEFAULT_JOINTS.map((definition) => {
			const override = jointOverrides.find((o) => o.id === definition.id);
			return override ? { ...definition, ...override } : definition;
		});
	}

let jointDefinitions = buildJointDefinitions();

	let canvasElement: HTMLCanvasElement;
	let axesCanvasElement: HTMLCanvasElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let axesRenderer: THREE.WebGLRenderer;
	let controls: OrbitControls;
	let loader: GLTFLoader;
	let clock: THREE.Clock;
	let animationFrameId = 0;

	// Axes inset (top-right overlay)
	let axesScene: THREE.Scene;
	let axesCamera: THREE.PerspectiveCamera;
	let axesGroup: THREE.Group; // Group that contains axes + labels, rotates together
	const AXES_INSET_SIZE = 120; // px

let placeholderRoot: THREE.Group | null = null;
let modelRoot: THREE.Object3D | null = null;
let usingPlaceholder = $state(true);

let jointObjects: Array<THREE.Object3D | null> = new Array(jointDefinitions.length).fill(null);
let jointBaseAngles: number[] = new Array(jointDefinitions.length).fill(0);
let currentAngles: number[] = new Array(jointDefinitions.length).fill(0);
let targetAngleMap: Map<number, number> = new Map();

	const SMOOTHING_STRENGTH = 8; // higher = snappier interpolation
	const PLACEHOLDER_SCALE = 0.01; // Convert mm to scene units for generated mesh

	const ARM_CONFIG = {
		base: { height: 50, radius: 30 },
		shoulder: { length: 80, radius: 12 },
		upperArm: { length: 100, radius: 10 },
		forearm: { length: 100, radius: 8 },
		wrist: { length: 40, radius: 8 },
		gripper: { length: 30, width: 20, depth: 10 }
	};

function registerJoint(index: number, object: THREE.Object3D | null, wrapWithPivot = false) {
    if (!object) return;

    let rotatable: THREE.Object3D = object;

    if (wrapWithPivot && object.parent) {
        // Insert a clean pivot above the node to avoid gimbal and baked pre-rotations.
        // 1) Record current local transform
        const parent = object.parent;
        const oldPos = object.position.clone();
        const oldQuat = object.quaternion.clone();
        const oldScale = object.scale.clone();

        // 2) Create pivot with the node's original local transform
        const pivot = new THREE.Group();
        pivot.position.copy(oldPos);
        pivot.quaternion.copy(oldQuat);
        pivot.scale.set(1, 1, 1);

        // 3) Re-parent: parent -> pivot -> node, reset node local transform
        parent.add(pivot);
        object.removeFromParent();
        object.position.set(0, 0, 0);
        object.quaternion.set(0, 0, 0, 1);
        object.scale.copy(oldScale);
        pivot.add(object);

        rotatable = pivot;
    }

    jointObjects[index] = rotatable;
    const axis = jointDefinitions[index].axis;
    jointBaseAngles[index] = (rotatable.rotation as THREE.Euler)[axis];
    const target = targetAngleMap.get(jointDefinitions[index].id) ?? 0;
    currentAngles[index] = target;
    applyRotation(index, target);
}

	function clearRegisteredJoints() {
		jointObjects = new Array(jointDefinitions.length).fill(null);
		jointBaseAngles = new Array(jointDefinitions.length).fill(0);
		currentAngles = new Array(jointDefinitions.length).fill(0);
	}

	function disposeObject(object: THREE.Object3D | null) {
		if (!object) return;
		object.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry?.dispose?.();
				if (Array.isArray(child.material)) {
					child.material.forEach((mat) => mat.dispose?.());
				} else {
					(child.material as THREE.Material | undefined)?.dispose?.();
				}
			}
		});
	}

	function applyRotation(index: number, relativeAngle: number) {
		const object = jointObjects[index];
		if (!object) return;
		const definition = jointDefinitions[index];
		const baseAngle = jointBaseAngles[index] ?? 0;
		const direction = definition.invert ? -1 : 1;
		const finalAngle = baseAngle + (definition.offset ?? 0) + direction * relativeAngle;
		object.rotation[definition.axis] = finalAngle;
	}

	function createPlaceholderArm() {
		if (placeholderRoot) {
			scene.remove(placeholderRoot);
			disposeObject(placeholderRoot);
		}
		placeholderRoot = new THREE.Group();
		scene.add(placeholderRoot);
		clearRegisteredJoints();

		const armMaterial = new THREE.MeshStandardMaterial({
			color: 0x2196f3,
			metalness: 0.3,
			roughness: 0.7
		});

		const jointMaterial = new THREE.MeshStandardMaterial({
			color: 0xff9800,
			metalness: 0.5,
			roughness: 0.5
		});

		const base = new THREE.Group();
		const baseCylinder = new THREE.Mesh(
			new THREE.CylinderGeometry(
				ARM_CONFIG.base.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.base.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.base.height * PLACEHOLDER_SCALE,
				16
			),
			armMaterial
		);
		baseCylinder.position.y = (ARM_CONFIG.base.height / 2) * PLACEHOLDER_SCALE;
		base.add(baseCylinder);
		placeholderRoot.add(base);
		registerJoint(0, base);

		const shoulder = new THREE.Group();
		shoulder.position.y = ARM_CONFIG.base.height * PLACEHOLDER_SCALE;
		const shoulderJoint = new THREE.Mesh(
			new THREE.SphereGeometry(ARM_CONFIG.shoulder.radius * PLACEHOLDER_SCALE * 1.2, 16, 16),
			jointMaterial
		);
		shoulder.add(shoulderJoint);
		const shoulderLink = new THREE.Mesh(
			new THREE.CylinderGeometry(
				ARM_CONFIG.shoulder.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.shoulder.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.shoulder.length * PLACEHOLDER_SCALE,
				16
			),
			armMaterial
		);
		shoulderLink.position.y = (ARM_CONFIG.shoulder.length / 2) * PLACEHOLDER_SCALE;
		shoulderLink.rotation.z = Math.PI / 2;
		shoulderLink.position.x = (ARM_CONFIG.shoulder.length / 2) * PLACEHOLDER_SCALE;
		shoulder.add(shoulderLink);
		base.add(shoulder);
		registerJoint(1, shoulder);

		const elbow = new THREE.Group();
		elbow.position.x = ARM_CONFIG.shoulder.length * PLACEHOLDER_SCALE;
		const elbowJoint = new THREE.Mesh(
			new THREE.SphereGeometry(ARM_CONFIG.upperArm.radius * PLACEHOLDER_SCALE * 1.2, 16, 16),
			jointMaterial
		);
		elbow.add(elbowJoint);
		const upperArm = new THREE.Mesh(
			new THREE.CylinderGeometry(
				ARM_CONFIG.upperArm.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.upperArm.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.upperArm.length * PLACEHOLDER_SCALE,
				16
			),
			armMaterial
		);
		upperArm.rotation.z = Math.PI / 2;
		upperArm.position.x = (ARM_CONFIG.upperArm.length / 2) * PLACEHOLDER_SCALE;
		elbow.add(upperArm);
		shoulder.add(elbow);
		registerJoint(2, elbow);

		const wristRotate = new THREE.Group();
		wristRotate.position.x = ARM_CONFIG.upperArm.length * PLACEHOLDER_SCALE;
		const wristJoint = new THREE.Mesh(
			new THREE.SphereGeometry(ARM_CONFIG.forearm.radius * PLACEHOLDER_SCALE * 1.2, 16, 16),
			jointMaterial
		);
		wristRotate.add(wristJoint);
		const forearm = new THREE.Mesh(
			new THREE.CylinderGeometry(
				ARM_CONFIG.forearm.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.forearm.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.forearm.length * PLACEHOLDER_SCALE,
				16
			),
			armMaterial
		);
		forearm.rotation.z = Math.PI / 2;
		forearm.position.x = (ARM_CONFIG.forearm.length / 2) * PLACEHOLDER_SCALE;
		wristRotate.add(forearm);
		elbow.add(wristRotate);
		registerJoint(3, wristRotate);

		const wristTilt = new THREE.Group();
		wristTilt.position.x = ARM_CONFIG.forearm.length * PLACEHOLDER_SCALE;
		const wristTiltJoint = new THREE.Mesh(
			new THREE.SphereGeometry(ARM_CONFIG.wrist.radius * PLACEHOLDER_SCALE * 1.2, 16, 16),
			jointMaterial
		);
		wristTilt.add(wristTiltJoint);
		const wristLink = new THREE.Mesh(
			new THREE.CylinderGeometry(
				ARM_CONFIG.wrist.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.wrist.radius * PLACEHOLDER_SCALE,
				ARM_CONFIG.wrist.length * PLACEHOLDER_SCALE,
				16
			),
			armMaterial
		);
		wristLink.rotation.z = Math.PI / 2;
		wristLink.position.x = (ARM_CONFIG.wrist.length / 2) * PLACEHOLDER_SCALE;
		wristTilt.add(wristLink);
		wristRotate.add(wristTilt);
		registerJoint(4, wristTilt);

		const gripper = new THREE.Group();
		gripper.position.x = ARM_CONFIG.wrist.length * PLACEHOLDER_SCALE;
		const gripperBase = new THREE.Mesh(
			new THREE.BoxGeometry(
				ARM_CONFIG.gripper.width * PLACEHOLDER_SCALE,
				ARM_CONFIG.gripper.depth * PLACEHOLDER_SCALE,
				ARM_CONFIG.gripper.length * PLACEHOLDER_SCALE
			),
			armMaterial
		);
		gripperBase.position.z = (ARM_CONFIG.gripper.length / 2) * PLACEHOLDER_SCALE;
		gripper.add(gripperBase);

		const fingerGeometry = new THREE.BoxGeometry(
			ARM_CONFIG.gripper.width * 0.1 * PLACEHOLDER_SCALE,
			ARM_CONFIG.gripper.depth * PLACEHOLDER_SCALE,
			ARM_CONFIG.gripper.length * 0.5 * PLACEHOLDER_SCALE
		);
		const leftFinger = new THREE.Mesh(fingerGeometry, jointMaterial);
		leftFinger.position.set(
			ARM_CONFIG.gripper.width * 0.4 * PLACEHOLDER_SCALE,
			0,
			ARM_CONFIG.gripper.length * PLACEHOLDER_SCALE
		);
		gripper.add(leftFinger);

		const rightFinger = new THREE.Mesh(fingerGeometry, jointMaterial);
		rightFinger.position.set(
			-ARM_CONFIG.gripper.width * 0.4 * PLACEHOLDER_SCALE,
			0,
			ARM_CONFIG.gripper.length * PLACEHOLDER_SCALE
		);
		gripper.add(rightFinger);

		wristTilt.add(gripper);
		registerJoint(5, gripper);
	}

	async function loadRealModel(): Promise<boolean> {
		if (!modelUrl) return false;
		return new Promise((resolve) => {
			loader.load(
				modelUrl,
				(gltf) => {
					if (placeholderRoot) {
						scene.remove(placeholderRoot);
						disposeObject(placeholderRoot);
						placeholderRoot = null;
					}
					usingPlaceholder = false;
					modelRoot = gltf.scene;
					modelRoot.scale.setScalar(modelScale);
					scene.add(modelRoot);
					clearRegisteredJoints();

					jointDefinitions.forEach((definition, index) => {
						if (!definition.nodeName || !modelRoot) return;
            const node = modelRoot.getObjectByName(definition.nodeName) ?? null;
            if (!node) return;
            registerJoint(index, node, true);
					});

					const bbox = new THREE.Box3().setFromObject(modelRoot);
					const center = bbox.getCenter(new THREE.Vector3());
					controls.target.copy(center);
					controls.update();

					resolve(true);
				},
				undefined,
				(error) => {
					console.warn(`ArmViewer: failed to load model at ${modelUrl}.`, error);
					usingPlaceholder = true;
					resolve(false);
				}
			);
		});
	}

	function updateAnimatedJoints(delta: number) {
		jointDefinitions.forEach((definition, index) => {
			const object = jointObjects[index];
			if (!object) return;
			const target = targetAngleMap.get(definition.id) ?? 0;
			const current = currentAngles[index] ?? 0;
			const next = THREE.MathUtils.damp(current, target, SMOOTHING_STRENGTH, delta);
			currentAngles[index] = next;
			applyRotation(index, next);
		});
	}

	function initScene() {
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x1a1a1a);

		camera = new THREE.PerspectiveCamera(
			50,
			canvasElement.clientWidth / canvasElement.clientHeight,
			0.05,
			100
		);

		// Calculate camera position based on zoom percentage
		// Base position at 100% zoom
		const baseDistance = 2.8;
		const zoomFactor = 100 / initialZoom; // Higher zoom % = closer = smaller distance
		const distance = baseDistance * zoomFactor;
		const ratio = distance / baseDistance;

		camera.position.set(2.8 * ratio, 1.8 * ratio, 2.8 * ratio);
		camera.lookAt(0, 0.6, 0);

		renderer = new THREE.WebGLRenderer({
			canvas: canvasElement,
			antialias: true
		});
		renderer.setSize(canvasElement.clientWidth, canvasElement.clientHeight, false);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance

		const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
		scene.add(ambientLight);

		const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
		keyLight.position.set(6, 10, 6);
		scene.add(keyLight);

		const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
		rimLight.position.set(-6, 4, -4);
		scene.add(rimLight);

		// Create grid with colored center lines (like Cinema 4D)
		const gridSize = 6;
		const gridDivisions = 24;
		const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
		gridHelper.position.y = 0;
		scene.add(gridHelper);

		// Add colored axis lines ONLY on positive side (like Cinema 4D)
		// Use polygonOffset to prevent Z-fighting from ANY angle

		// X axis (red) - ONLY positive side (0 to +X)
		const xAxisGeometry = new THREE.BufferGeometry();
		const xAxisPositions = new Float32Array([
			0, 0, 0,              // center (same Y as grid!)
			gridSize / 2, 0, 0    // positive X direction
		]);
		xAxisGeometry.setAttribute('position', new THREE.BufferAttribute(xAxisPositions, 3));
		const xAxisMaterial = new THREE.LineBasicMaterial({
			color: 0xff0000,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1
		});
		const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
		scene.add(xAxisLine);

		// Z axis (blue) - ONLY positive side (0 to -Z, towards camera/back)
		const zAxisGeometry = new THREE.BufferGeometry();
		const zAxisPositions = new Float32Array([
			0, 0, 0,               // center (same Y as grid!)
			0, 0, -gridSize / 2    // negative Z direction (towards camera/back)
		]);
		zAxisGeometry.setAttribute('position', new THREE.BufferAttribute(zAxisPositions, 3));
		const zAxisMaterial = new THREE.LineBasicMaterial({
			color: 0x4a90ff,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1
		});
		const zAxisLine = new THREE.Line(zAxisGeometry, zAxisMaterial);
		scene.add(zAxisLine);

		// Y axis (green) - ONLY positive side (0 to +Y)
		const yAxisGeometry = new THREE.BufferGeometry();
		const yAxisPositions = new Float32Array([
			0, 0, 0,              // center (ground)
			0, gridSize / 2, 0    // positive Y direction (up)
		]);
		yAxisGeometry.setAttribute('position', new THREE.BufferAttribute(yAxisPositions, 3));
		const yAxisMaterial = new THREE.LineBasicMaterial({
			color: 0x00ff00,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1
		});
		const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
		scene.add(yAxisLine);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.minDistance = 0.2;
		controls.maxDistance = 15;
		controls.target.set(0, 0.6, 0);

		clock = new THREE.Clock();
		loader = new GLTFLoader();

		createPlaceholderArm();
		loadRealModel();

		// Create separate axes renderer for overlay
		axesRenderer = new THREE.WebGLRenderer({
			canvas: axesCanvasElement,
			antialias: true,
			alpha: true // Transparent background
		});
		axesRenderer.setSize(AXES_INSET_SIZE, AXES_INSET_SIZE, false);
		axesRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		// Create axes scene
		axesScene = new THREE.Scene();
		axesCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 10); // Smaller FOV = less distortion
		axesCamera.position.set(0, 0, 4); // Move camera farther back so axes never get clipped

		// Create a group that will hold axes + labels and rotate together
		axesGroup = new THREE.Group();
		axesScene.add(axesGroup);

		// Create solid color axes (no gradient like AxesHelper)
		const axisLength = 0.5;

		// X axis - solid red
		const xGizmoGeometry = new THREE.BufferGeometry();
		xGizmoGeometry.setAttribute('position', new THREE.BufferAttribute(
			new Float32Array([0, 0, 0, axisLength, 0, 0]), 3
		));
		const xGizmoLine = new THREE.Line(
			xGizmoGeometry,
			new THREE.LineBasicMaterial({ color: 0xff0000 })
		);
		axesGroup.add(xGizmoLine);

		// Y axis - solid green
		const yGizmoGeometry = new THREE.BufferGeometry();
		yGizmoGeometry.setAttribute('position', new THREE.BufferAttribute(
			new Float32Array([0, 0, 0, 0, axisLength, 0]), 3
		));
		const yGizmoLine = new THREE.Line(
			yGizmoGeometry,
			new THREE.LineBasicMaterial({ color: 0x00ff00 })
		);
		axesGroup.add(yGizmoLine);

		// Z axis - solid blue
		const zGizmoGeometry = new THREE.BufferGeometry();
		zGizmoGeometry.setAttribute('position', new THREE.BufferAttribute(
			new Float32Array([0, 0, 0, 0, 0, axisLength]), 3
		));
		const zGizmoLine = new THREE.Line(
			zGizmoGeometry,
			new THREE.LineBasicMaterial({ color: 0x4a90ff })
		);
		axesGroup.add(zGizmoLine);

		// Add X/Y/Z letter sprites
		const makeLabel = (text: string, color: string) => {
			const size = 64;
			const canvas = document.createElement('canvas');
			canvas.width = size; canvas.height = size;
			const ctx = canvas.getContext('2d')!;
			ctx.clearRect(0, 0, size, size);
			ctx.font = 'bold 48px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = color;
			ctx.fillText(text, size / 2, size / 2);
			const tex = new THREE.CanvasTexture(canvas);
			const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
			const spr = new THREE.Sprite(mat);
			spr.scale.set(0.4, 0.4, 1);
			return spr;
		};

		// Use EXACT same colors as main scene axes
		const labelX = makeLabel('X', '#ff0000'); // Pure red - same as main X axis
		labelX.position.set(0.65, 0, 0);
		const labelY = makeLabel('Y', '#00ff00'); // Pure green - same as main Y axis
		labelY.position.set(0, 0.65, 0);
		const labelZ = makeLabel('Z', '#4a90ff'); // Blue - same as main Z axis
		labelZ.position.set(0, 0, 0.65);
		axesGroup.add(labelX, labelY, labelZ);

		animate();
	}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    updateAnimatedJoints(delta);
    controls.update();

    // Render main scene
    renderer.render(scene, camera);

    // Render axes overlay - the axes should match the world orientation as seen from camera
    // We need to rotate the axes opposite to the camera rotation
    axesGroup.quaternion.copy(camera.quaternion).invert();
    axesRenderer.render(axesScene, axesCamera);
}

	function handleResize() {
		if (!canvasElement || !camera || !renderer) return;
		const width = canvasElement.clientWidth;
		const height = canvasElement.clientHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height, false); // false = don't update canvas style, let CSS control it
	}

	onMount(() => {
		initScene();
		window.addEventListener('resize', handleResize);
		// Ensure proper sizing after DOM is ready
		requestAnimationFrame(() => {
			handleResize();
		});
	});

onDestroy(() => {
	window.removeEventListener('resize', handleResize);
	if (animationFrameId) cancelAnimationFrame(animationFrameId);
	controls?.dispose();
	renderer?.dispose();
	axesRenderer?.dispose();
	disposeObject(placeholderRoot);
	disposeObject(modelRoot);
});

$effect(() => {
	targetAngleMap = new Map(jointAngles.map((angle) => [angle.id, angle.angle]));
	jointDefinitions.forEach((definition, index) => {
		if (jointObjects[index]) {
			const target = targetAngleMap.get(definition.id) ?? 0;
				currentAngles[index] = target;
				applyRotation(index, target);
			}
		});
	});
</script>

<div class="viewer-container">
	<canvas bind:this={canvasElement}></canvas>
	<canvas bind:this={axesCanvasElement} class="axes-overlay"></canvas>
	{#if usingPlaceholder}
		<div class="placeholder-banner">
			Using procedural preview. Place your SO-101 model at <code>static/models/so-101.glb</code> to render the real arm.
		</div>
	{/if}
	<div class="controls-info">
		<div class="control-hint">Left drag: Rotate</div>
		<div class="control-hint">Right drag: Pan</div>
		<div class="control-hint">Scroll: Zoom</div>
	</div>
</div>

<style>
	.viewer-container {
		position: relative;
		width: 100%;
		height: 480px;
		border-radius: 8px;
		overflow: hidden;
		background: #101010;
		border: 1px solid #2c2c2c;
	}

	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}

	.axes-overlay {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 120px;
		height: 120px;
		pointer-events: none;
		z-index: 10;
	}

	.controls-info {
		position: absolute;
		bottom: 10px;
		right: 10px;
		background: rgba(0, 0, 0, 0.65);
		padding: 8px 12px;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #ccc;
		pointer-events: none;
	}

	.control-hint {
		margin: 2px 0;
	}

	.placeholder-banner {
		position: absolute;
		top: 12px;
		left: 12px;
		background: rgba(255, 152, 0, 0.12);
		border: 1px solid rgba(255, 152, 0, 0.4);
		color: #ffcf7a;
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 0.75rem;
		max-width: 320px;
	}

	.placeholder-banner code {
		font-family: 'Fira Code', monospace;
		font-size: 0.75rem;
		color: inherit;
	}
</style>
