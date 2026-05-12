/**
 * App.js -- Root Navigator for InkVistAR Mobile
 * Handles auth state, role-based routing, and nested navigation.
 * Expo Go compatible -- zero native modules.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Platform, View, Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import { Shield, Users, Calendar as CalendarIcon, Grid, Package, PenTool } from 'lucide-react-native';

// Auth Screens
import { LoginPage } from './screens/LoginPage.jsx';
import { RegisterPage } from './screens/RegisterPage.jsx';
import { ResetPasswordPage } from './screens/ResetPasswordPage.jsx';
import { OTPVerification } from './components/OTPVerification';

// Customer Screens
import { CustomerDashboard } from './screens/CustomerDashboard.jsx';
import { CustomerProfilePage } from './screens/CustomerProfilePage.jsx';
import { CustomerAppointments } from './screens/CustomerAppointments.jsx';
import { CustomerChatbotPage } from './screens/CustomerChatbotPage.jsx';
import { CustomerBooking } from './screens/CustomerBooking.jsx';
import { CustomerGallery } from './screens/CustomerGallery.jsx';
import { CustomerTransactions } from './screens/CustomerTransactions.jsx';
import { CustomerReview } from './screens/CustomerReview.jsx';
import { CustomerReports } from './screens/CustomerReports.jsx';
import { CustomerNotifications } from './screens/CustomerNotifications.jsx';
import { CustomerAftercare } from './screens/CustomerAftercare.jsx';

// Artist Screens
import { ArtistDashboard } from './screens/ArtistDashboard.jsx';
import { ArtistProfile } from './screens/ArtistProfile.jsx';
import { ArtistSchedule } from './screens/ArtistSchedule.jsx';
import { ArtistSessions } from './screens/ArtistSessions.jsx';
import { ArtistActiveSession } from './screens/ArtistActiveSession.jsx';
import { ArtistWorks } from './screens/ArtistWorks.jsx';
import { ArtistEarnings } from './screens/ArtistEarnings.jsx';
import { ArtistNotifications } from './screens/ArtistNotifications.jsx';

// Admin Screens
import { AdminDashboard } from './screens/AdminDashboard.jsx';
import { AdminUserManagement } from './screens/AdminUserManagement.jsx';
import { AdminAppointmentManagement } from './screens/AdminAppointmentManagement.jsx';
import { AdminStudio } from './screens/AdminStudio.jsx';
import { AdminInventory } from './screens/AdminInventory.jsx';
import { AdminNotifications } from './screens/AdminNotifications.jsx';
import { AdminAnalytics } from './screens/AdminAnalytics.jsx';
import { AdminSettings } from './screens/AdminSettings.jsx';
import { AdminChat } from './screens/AdminChat.jsx';
import { AdminPOS } from './screens/AdminPOS.jsx';
import { AdminReviewModeration } from './screens/AdminReviewModeration.jsx';
import { AdminBilling } from './screens/AdminBilling.jsx';
import { AdminStaff } from './screens/AdminStaff.jsx';
import { AdminClients } from './screens/AdminClients.jsx';
import { AdminSalesReports } from './screens/AdminSalesReports.jsx';

// Placeholder for AR Tab
import PlaceholderScreen from './components/PlaceholderScreen.jsx';

// API utilities
import {
  loginUser, registerUser, sendOTP, resetUserPassword,
  saveAuthToken, updatePushToken, removeAuthToken,
} from './src/utils/api';
import { registerForPushNotifications } from './src/utils/pushNotifications';

// Theme & Global Contexts
import { colors } from './src/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { ToastProvider } from './src/context/ToastContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();


// ============================================================
// TAB NAVIGATORS (one per role)
// ============================================================

const CustomerTabs = ({ user, onLogout }) => {
  const { theme } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 85 : 60,
        paddingBottom: Platform.OS === 'ios' ? 24 : 10,
        paddingTop: 8,
      },
      tabBarActiveTintColor: theme.gold,
      tabBarInactiveTintColor: theme.textTertiary,
      tabBarIcon: ({ focused, color }) => {
        const icons = {
          Home: focused ? 'home' : 'home-outline',
          Gallery: focused ? 'images' : 'images-outline',
          AR: focused ? 'camera' : 'camera-outline',
          Chat: focused ? 'chatbubble' : 'chatbubble-outline',
          Appointments: focused ? 'calendar' : 'calendar-outline',
          Profile: focused ? 'person' : 'person-outline',
        };
        return <Ionicons name={icons[route.name] || 'ellipse'} size={24} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home">
      {(props) => <CustomerDashboard {...props} userName={user.name} userId={user.id} onNavigate={props.navigation.navigate} onLogout={onLogout} />}
    </Tab.Screen>
    <Tab.Screen name="Gallery">
      {(props) => <CustomerGallery {...props} userId={user?.id} onBack={() => props.navigation.navigate('Home')} />}
    </Tab.Screen>
    <Tab.Screen name="AR">
      {(props) => <PlaceholderScreen navigation={props.navigation} title="AR Tattoo Preview" feature="Augmented Reality" />}
    </Tab.Screen>
    <Tab.Screen name="Chat">
      {(props) => <CustomerChatbotPage {...props} userId={user.id} userName={user.name} onBack={() => props.navigation.navigate('Home')} />}
    </Tab.Screen>
    <Tab.Screen name="Appointments">
      {(props) => <CustomerAppointments {...props} customerId={user.id} onBack={() => props.navigation.navigate('Home')} onBookNew={() => props.navigation.navigate('booking-create')} />}
    </Tab.Screen>
    <Tab.Screen name="Profile">
      {(props) => <CustomerProfilePage {...props} userName={user.name} userEmail={user.email} userId={user.id} onBack={() => props.navigation.navigate('Home')} onLogout={onLogout} />}
    </Tab.Screen>
  </Tab.Navigator>
  );
};

const ArtistTabs = ({ user, onLogout }) => {
  const { theme } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 85 : 60,
        paddingBottom: Platform.OS === 'ios' ? 24 : 10,
        paddingTop: 8,
      },
      tabBarActiveTintColor: theme.gold,
      tabBarInactiveTintColor: theme.textTertiary,
      tabBarIcon: ({ focused, color }) => {
        if (route.name === 'Sessions') return <PenTool size={24} color={color} />;
        const icons = {
          Home: focused ? 'home' : 'home-outline',
          Schedule: focused ? 'calendar' : 'calendar-outline',
          Works: focused ? 'images' : 'images-outline',
          Profile: focused ? 'person' : 'person-outline',
        };
        return <Ionicons name={icons[route.name] || 'ellipse'} size={24} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home">
      {(props) => <ArtistDashboard {...props} userName={user.name} userEmail={user.email} userId={user.id} onNavigate={props.navigation.navigate} onLogout={onLogout} />}
    </Tab.Screen>
    <Tab.Screen name="Schedule">
      {(props) => <ArtistSchedule {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
    </Tab.Screen>
    <Tab.Screen name="Sessions">
      {(props) => <ArtistSessions {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
    </Tab.Screen>
    <Tab.Screen name="Works">
      {(props) => <ArtistWorks {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
    </Tab.Screen>
    <Tab.Screen name="Profile">
      {(props) => <ArtistProfile {...props} userId={user.id} userName={user.name} userEmail={user.email} onBack={() => props.navigation.navigate('Home')} onLogout={onLogout} />}
    </Tab.Screen>
  </Tab.Navigator>
  );
};

const AdminTabs = ({ user, onLogout }) => {
  const { theme } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 85 : 55,
        paddingBottom: Platform.OS === 'ios' ? 24 : 5,
        paddingTop: 8,
        elevation: 0,
        borderTopWidth: 1,
      },
      tabBarActiveTintColor: theme.gold,
      tabBarInactiveTintColor: theme.textTertiary,
      tabBarIcon: ({ focused, color }) => {
        let iconName = 'ellipse';
        if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
        if (route.name === 'Users') return <Users size={24} color={color} />;
        if (route.name === 'Bookings') iconName = focused ? 'calendar' : 'calendar-outline';
        if (route.name === 'Studio') iconName = focused ? 'business' : 'business-outline';
        if (route.name === 'POS') return <Package size={24} color={color} />;
        if (route.name === 'Profile') iconName = focused ? 'settings' : 'settings-outline';
        return <Ionicons name={iconName} size={24} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Dashboard">
      {(props) => <AdminDashboard {...props} onLogout={onLogout} />}
    </Tab.Screen>
    <Tab.Screen name="Users" component={AdminUserManagement} />
    <Tab.Screen name="Bookings" component={AdminAppointmentManagement} />
    <Tab.Screen name="Studio" component={AdminStudio} />
  </Tab.Navigator>
  );};

const ManagerTabs = ({ user, onLogout }) => {
  const { theme } = useTheme();
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.surface,
        borderTopColor: theme.border,
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: Platform.OS === 'ios' ? 85 : 55,
        paddingBottom: Platform.OS === 'ios' ? 24 : 5,
        paddingTop: 8,
        elevation: 0,
        borderTopWidth: 1,
      },
      tabBarActiveTintColor: theme.gold,
      tabBarInactiveTintColor: theme.textTertiary,
      tabBarIcon: ({ focused, color }) => {
        if (route.name === 'Dashboard') return <Shield size={24} color={color} />;
        if (route.name === 'Bookings') return <CalendarIcon size={24} color={color} />;
        if (route.name === 'Studio') return <Grid size={24} color={color} />;
        if (route.name === 'POS') return <Package size={24} color={color} />;
        return <Shield size={24} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Dashboard">
      {(props) => <AdminDashboard {...props} onLogout={onLogout} isManager={true} />}
    </Tab.Screen>
    <Tab.Screen name="Bookings" component={AdminAppointmentManagement} />
    <Tab.Screen name="Studio" component={AdminStudio} />
    <Tab.Screen name="POS" component={AdminPOS} />
  </Tab.Navigator>
  );
};

// ============================================================
// MAIN APP
// ============================================================

function AppContent() {
  const [user, setUser] = useState(null);
  const [showOTP, setShowOTP] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginUserType, setLoginUserType] = useState('customer');

  // Hide Android system nav bar
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
    }
  }, []);

  // Restore persisted session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const stored = await AsyncStorage.getItem('user_session');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id && parsed.name) {
            setUser(parsed);
          }
        }
      } catch (e) {
        console.warn('Session restore failed:', e.message);
      }
    };
    restoreSession();
  }, []);

  const hideNavigationBar = () => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
    }
  };

  const handleLogin = useCallback(async (email, password, userType) => {
    const result = await loginUser(email, password, userType);
    if (result && result.success === true && result.user && result.user.name) {
      if (result.token) await saveAuthToken(result.token);
      setUser(result.user);
      await AsyncStorage.setItem('user_session', JSON.stringify(result.user));
      registerForPushNotifications(result.user.id).catch(e => console.warn('[PUSH] Registration failed:', e.message));
    } else {
      if (result?.requireVerification) {
        Alert.alert('Verification Required', result.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resend Link', onPress: () => {} },
        ]);
      } else {
        Alert.alert('Login Failed', result?.message || 'Invalid credentials');
      }
    }
    return result;
  }, []);

  const handleLogout = useCallback(async () => {
    await removeAuthToken();
    await AsyncStorage.removeItem('user_session');
    setUser(null);
  }, []);

  const handleRegister = useCallback(async (name, email, password, phone, userType, orphanAppointmentId, navigation, healthConditions = [], healthAllergens = []) => {
    const result = await registerUser(name, email, password, userType, phone, orphanAppointmentId, healthConditions, healthAllergens);
    if (result.success && result.message) {
      if (navigation) {
        navigation.navigate('login', { prefillEmail: email, message: result.message });
      }
    } else {
      Alert.alert('Registration Failed', result.message || 'Please try again');
    }
    return result;
  }, []);

  const handleForgotPassword = useCallback(async (email, type) => {
    const selectedType = type || 'customer';
    const result = await sendOTP(email, selectedType);
    if (result.success) {
      setLoginEmail(email);
      setLoginUserType(selectedType);
      setIsResetMode(true);
      setShowOTP(true);
    } else {
      Alert.alert('Error', result.message || 'Failed to send OTP.');
    }
  }, []);

  const handleOTPVerified = useCallback((verifiedUser) => {
    if (isResetMode) {
      setShowOTP(false);
      setShowResetPassword(true);
    } else {
      setUser(verifiedUser);
      setShowOTP(false);
    }
  }, [isResetMode]);

  const handlePasswordReset = useCallback(async (newPassword) => {
    const result = await resetUserPassword(loginEmail, newPassword);
    if (result.success) {
      Alert.alert('Success', 'Password updated successfully! Please login.');
      setShowResetPassword(false);
      setIsResetMode(false);
    } else {
      Alert.alert('Error', 'Failed to update password: ' + result.message);
    }
  }, [loginEmail]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <View style={{ flex: 1 }} onTouchStart={Platform.OS === 'android' ? hideNavigationBar : undefined}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 300 }}>
          {user ? (
            // ----- LOGGED IN -----
            user.type === 'admin' ? (
              <>
                <Stack.Screen name="admin-main">
                  {() => <AdminTabs user={user} onLogout={handleLogout} />}
                </Stack.Screen>
                <Stack.Screen name="admin-inventory" component={AdminInventory} />
                <Stack.Screen name="admin-notifications" component={AdminNotifications} />
                <Stack.Screen name="admin-analytics" component={AdminAnalytics} />
                <Stack.Screen name="admin-settings" component={AdminSettings} />
                <Stack.Screen name="admin-chat" component={AdminChat} />
                <Stack.Screen name="admin-pos" component={AdminPOS} />
                <Stack.Screen name="admin-reviews" component={AdminReviewModeration} />
                <Stack.Screen name="admin-billing" component={AdminBilling} />
                <Stack.Screen name="admin-staff" component={AdminStaff} />
                <Stack.Screen name="admin-clients" component={AdminClients} />
                <Stack.Screen name="admin-reports" component={AdminSalesReports} />
              </>
            ) : user.type === 'manager' ? (
              <>
                <Stack.Screen name="manager-main">
                  {() => <ManagerTabs user={user} onLogout={handleLogout} />}
                </Stack.Screen>
                <Stack.Screen name="admin-inventory" component={AdminInventory} />
                <Stack.Screen name="admin-analytics" component={AdminAnalytics} />
                <Stack.Screen name="admin-notifications" component={AdminNotifications} />
                <Stack.Screen name="admin-reports" component={AdminSalesReports} />
              </>
            ) : user.type === 'artist' ? (
              <>
                <Stack.Screen name="artist-main">
                  {() => <ArtistTabs user={user} onLogout={handleLogout} />}
                </Stack.Screen>
                <Stack.Screen name="artist-earnings">
                  {(props) => <ArtistEarnings {...props} artistId={user.id} onBack={() => props.navigation.goBack()} />}
                </Stack.Screen>
                <Stack.Screen name="artist-notifications">
                  {(props) => <ArtistNotifications {...props} userId={user.id} onBack={() => props.navigation.goBack()} />}
                </Stack.Screen>
                <Stack.Screen name="artist-active-session">
                  {(props) => (
                    <ArtistActiveSession
                      {...props}
                      appointment={props.route.params?.appointment}
                      onBack={() => props.navigation.goBack()}
                      onComplete={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>
              </>
            ) : (
              // CUSTOMER (default)
              <>
                <Stack.Screen name="customer-main">
                  {() => <CustomerTabs user={user} onLogout={handleLogout} />}
                </Stack.Screen>
                <Stack.Screen name="customer-notifications">
                  {(props) => <CustomerNotifications {...props} userId={user.id} onBack={() => props.navigation.goBack()} />}
                </Stack.Screen>
                <Stack.Screen name="booking-create">
                  {(props) => <CustomerBooking {...props} customerId={user.id} initialUser={user} onBack={() => props.navigation.goBack()} />}
                </Stack.Screen>
                <Stack.Screen name="customer-transactions" component={CustomerTransactions} />
                <Stack.Screen name="customer-review" component={CustomerReview} />
                <Stack.Screen name="CustomerReports" component={CustomerReports} />
                <Stack.Screen name="CustomerAftercare" component={CustomerAftercare} />
              </>
            )
          ) : showOTP ? (
            <Stack.Screen name="otp">
              {(props) => (
                <OTPVerification
                  {...props}
                  email={loginEmail}
                  userType={loginUserType}
                  onOTPVerified={handleOTPVerified}
                  onResendOTP={() => sendOTP(loginEmail, loginUserType)}
                  onCancel={() => setShowOTP(false)}
                  autoSend={false}
                />
              )}
            </Stack.Screen>
          ) : showResetPassword ? (
            <Stack.Screen name="reset-password">
              {() => <ResetPasswordPage email={loginEmail} onSubmit={handlePasswordReset} />}
            </Stack.Screen>
          ) : (
            // ----- NOT LOGGED IN -- straight to Login -----
            <>
              <Stack.Screen name="login">
                {(props) => (
                  <LoginPage
                    {...props}
                    onLogin={(email, password, userType) => handleLogin(email, password, userType)}
                    onForgotPassword={handleForgotPassword}
                    onSwitchToRegister={() => props.navigation.navigate('register')}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="register">
                {(props) => (
                  <RegisterPage
                    {...props}
                    onRegister={(name, email, password, phone, userType, orphanAppointmentId, healthConditions, healthAllergens) =>
                      handleRegister(name, email, password, phone, userType, orphanAppointmentId, props.navigation, healthConditions, healthAllergens)
                    }
                    onSwitchToLogin={() => props.navigation.navigate('login')}
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}