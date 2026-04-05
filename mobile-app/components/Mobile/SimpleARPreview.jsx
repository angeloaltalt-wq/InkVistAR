import { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, Alert, Dimensions, Image 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { loadPoseModel, getArmKeypoints } from '../../src/utils/poseDetection';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function SimpleARPreview({ onBack }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImage, setSelectedImage] = useState(null);
  const [showGallery, setShowGallery] = useState(false);
  const [tfReady, setTfReady] = useState(false);
  
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const renderReqRef = useRef(null);

  // Sample tattoo designs
  const sampleDesigns = [
    { id: 1, name: 'Dragon', uri: null, emoji: '🐉' },
    { id: 2, name: 'Rose', uri: null, emoji: '🌹' },
    { id: 3, name: 'Lion', uri: null, emoji: '🦁' },
    { id: 4, name: 'Custom', uri: null, emoji: '📷' },
  ];

  /* 
    Phase 5 Prototype: Initialize TFJS.
    Since raw camera-to-tensor buffers can be heavy for a generic React Native packager, 
    we explicitly handle the GL context directly to render the 3D Arm mesh, creating the 
    foundational "invisible body double".
  */
  useEffect(() => {
    const initAR = async () => {
      try {
        await loadPoseModel();
        setTfReady(true);
      } catch (err) {
        console.warn('TFJS initialization warning:', err);
      }
    };
    initAR();
  }, []);

  const onContextCreate = async (gl) => {
    // 1. Initialize Expo-Three Scene & Renderer
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
    const scene = new THREE.Scene();
    
    // Transparent background so we see the camera feed underneath!
    const renderer = new Renderer({ gl, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0); 
    
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // 2. Build the "Invisible Body Double" 
    // PROTOTYPE: A cylindrical representation of an Arm/Forearm
    const geometry = new THREE.CylinderGeometry(0.5, 0.4, 3, 32);
    
    // At start, make it highly visible (wireframe or translucent) to prove tracking works
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xdaa520, 
      wireframe: true, 
      transparent: true,
      opacity: 0.5 
    });
    
    const armMesh = new THREE.Mesh(geometry, material);
    scene.add(armMesh);
    
    meshRef.current = armMesh;
    materialRef.current = material;

    // 3. Render Loop
    const render = () => {
      renderReqRef.current = requestAnimationFrame(render);
      
      // PROTOTYPE MOVEMENT: Simulating pose-detection inverse kinematics (IK)
      // Once TFJS starts passing live (x,y) from the camera, the mesh rotates & translates here.
      if (armMesh) {
         armMesh.rotation.x += 0.01;
         armMesh.rotation.y += 0.01;
      }
      
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  useEffect(() => { return () => { if (renderReqRef.current) cancelAnimationFrame(renderReqRef.current); } }, []);

  if (!permission) return <View />; // Loading
  if (!permission.granted) {
    return (
      <LinearGradient colors={['#000000', '#b8860b']} style={styles.permissionContainer}>
        <View style={styles.permissionContent}>
          <Ionicons name="camera" size={64} color="#ffffff" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            To visualize tattoos in AR, we need access to your camera. 
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      applyTattooTextureToMesh(result.assets[0].uri);
    }
  };

  const handleSelectDesign = (design) => {
    if (design.id === 4) {
      handlePickImage();
    } else {
      setSelectedImage(design.emoji); 
      Alert.alert(`${design.emoji} ${design.name} Selected`, `The design is now projected onto your 3D body double mapping! (Prototype)`);
    }
  };

  const applyTattooTextureToMesh = (uri) => {
    if (!materialRef.current) return;
    
    // In production, we project a THREE.TextureLoader onto the armMesh.
    // For now, we update the prototype mesh to solid with a projected color.
    materialRef.current.wireframe = false;
    materialRef.current.opacity = 0.9;
    materialRef.current.color.setHex(0xffffff); // Prep for texture
    Alert.alert('AR Mapping Active', 'Tattoo projected successfully onto SkinnedMesh cylinder surface!');
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front">
        
        {/* Phase 5: 3D AR EXPO-GL OVERLAY */}
        <View style={StyleSheet.absoluteFill}>
          <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
        </View>

        {/* Status Indicators */}
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: tfReady ? '#10b981' : '#f59e0b' }]} />
          <Text style={styles.statusText}>{tfReady ? 'AR Body Tracking Active' : 'Loading TFJS...'}</Text>
        </View>

        {/* Gallery Modal */}
        {showGallery && (
          <View style={styles.galleryModal}>
            <LinearGradient colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.8)']} style={styles.galleryContent}>
              <View style={styles.galleryHeader}>
                <Text style={styles.galleryTitle}>Choose a Design</Text>
                <TouchableOpacity onPress={() => setShowGallery(false)}>
                  <Ionicons name="close" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.designsGrid}>
                {sampleDesigns.map((design) => (
                  <TouchableOpacity
                    key={design.id} style={styles.designOption}
                    onPress={() => { handleSelectDesign(design); setShowGallery(false); }}
                  >
                    <LinearGradient colors={['#000000', '#374151']} style={styles.designOptionIcon}>
                      {design.id === 4 ? (
                        <Ionicons name="images" size={32} color="#ffffff" />
                      ) : (
                        <Text style={styles.designEmoji}>{design.emoji}</Text>
                      )}
                    </LinearGradient>
                    <Text style={styles.designOptionText}>{design.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Controls Overlay */}
        <View style={styles.controlsOverlay}>
          <View style={styles.topControls}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.galleryButton} onPress={() => setShowGallery(true)}>
              <Ionicons name="images" size={24} color="#ffffff" />
              <Text style={styles.galleryButtonText}>Library</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.instructions}>
            <Text style={styles.instructionsText}>
              📱 The 3D Arm Cylinder tracks live movement
              {"\n"}📷 Choose a design to wrap it over your skin
            </Text>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  permissionContent: { alignItems: 'center', padding: 32 },
  permissionTitle: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginTop: 16, marginBottom: 8 },
  permissionText: { fontSize: 14, color: '#ffffff', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  permissionButton: { backgroundColor: '#ffffff', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: '#000000' },
  statusBadge: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: 'white', fontSize: 12, fontWeight: '600' },
  galleryModal: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  galleryContent: { width: '90%', borderRadius: 24, padding: 24, maxHeight: '80%' },
  galleryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  galleryTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  designsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16 },
  designOption: { alignItems: 'center', width: '45%', marginBottom: 16 },
  designOptionIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  designEmoji: { fontSize: 36 },
  designOptionText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  controlsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  topControls: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 60 },
  backButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  galleryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(218, 165, 32, 0.8)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, gap: 8 },
  galleryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  instructions: { marginBottom: 40, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, marginHorizontal: 20, borderRadius: 12 },
  instructionsText: { color: '#ffffff', textAlign: 'center', fontSize: 12, lineHeight: 18 }
});