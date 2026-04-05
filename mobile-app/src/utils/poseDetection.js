import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as poseDetection from '@tensorflow-models/pose-detection';

export const initTF = async () => {
  await tf.ready();
  console.log('TFJS is ready for AR Tracking');
};

export const loadPoseModel = async () => {
  await initTF();
  const model = poseDetection.SupportedModels.MoveNet;
  const detectorConfig = {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    enableSmoothing: true,
  };
  const detector = await poseDetection.createDetector(model, detectorConfig);
  console.log('MoveNet SinglePose Model Loaded');
  return detector;
};

// Common constants for arm mapping
export const getArmKeypoints = (pose) => {
  if (!pose || pose.length === 0) return null;
  const keypoints = pose[0].keypoints;
  
  // Track right arm (5, 7, 9) or left arm (6, 8, 10) depending on score
  const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');
  const rightElbow = keypoints.find(k => k.name === 'right_elbow');
  const rightWrist = keypoints.find(k => k.name === 'right_wrist');
  
  const leftShoulder = keypoints.find(k => k.name === 'left_shoulder');
  const leftElbow = keypoints.find(k => k.name === 'left_elbow');
  const leftWrist = keypoints.find(k => k.name === 'left_wrist');

  const rightScore = (rightShoulder?.score || 0) + (rightElbow?.score || 0) + (rightWrist?.score || 0);
  const leftScore = (leftShoulder?.score || 0) + (leftElbow?.score || 0) + (leftWrist?.score || 0);

  // Return best detected arm based on confidence (min threshold to avoid random snapping)
  if (rightScore > leftScore && rightScore > 1.2) {
    return { shoulder: rightShoulder, elbow: rightElbow, wrist: rightWrist, type: 'right', active: true };
  } else if (leftScore > 1.2) {
    return { shoulder: leftShoulder, elbow: leftElbow, wrist: leftWrist, type: 'left', active: true };
  }
  
  return { active: false }; // No high confidence arm detected
};
