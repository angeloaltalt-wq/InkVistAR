import React, { useRef } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../context/ThemeContext';

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

export const AnimatedTouchable = ({ children, onPress, style, innerStyle, activeOpacity = 0.9, disabled }) => {
  const { hapticsEnabled } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (disabled) return;
    if (hapticsEnabled !== false) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  };

  const pressOut = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 1, damping: 15, useNativeDriver: true }).start();
  };

  return (
    <AnimatedTouch
      disabled={disabled}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={activeOpacity}
      style={[style, innerStyle, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedTouch>
  );
};
