// App.js - UPDATED WITH SIMPLE COMPONENTS
import React, { useState, useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, Alert, ScrollView, TextInput, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// Import main screens
import { LoginPage } from './screens/LoginPage.jsx';
import { RegisterPage } from './screens/RegisterPage.jsx';
import { CustomerDashboard } from './screens/CustomerDashboard.jsx';
import { ArtistDashboard } from './screens/ArtistDashboard.jsx';
import { ResetPasswordPage } from './screens/ResetPasswordPage.jsx';

// Import customer pages
import { CustomerProfilePage } from './screens/CustomerProfilePage.jsx';
import { CustomerARPage } from './screens/CustomerARPage.jsx';
import { CustomerChatbotPage } from './screens/CustomerChatbotPage.jsx';
import { CustomerAppointments } from './screens/CustomerAppointments.jsx';
import ChatScreen from './screens/ChatScreen.jsx';

// Import artist pages
import { ArtistProfile } from './screens/ArtistProfile.jsx';
import { ArtistSchedule } from './screens/ArtistSchedule.jsx';
import { ArtistClients } from './screens/ArtistClients.jsx';
import { ArtistWorks } from './screens/ArtistWorks.jsx';
import { ArtistEarnings } from './screens/ArtistEarnings.jsx';
import { ArtistNotifications } from './screens/ArtistNotifications.jsx';
import { CustomerNotifications } from './screens/CustomerNotifications.jsx';

// Import Admin pages
import { AdminDashboard } from './screens/AdminDashboard.jsx';
import { AdminUserManagement } from './screens/AdminUserManagement.jsx';
import { AdminAppointmentManagement } from './screens/AdminAppointmentManagement.jsx';
import { AdminSystemHealth } from './screens/AdminSystemHealth.jsx';

// Import New Admin Features
import { AdminServices } from './screens/AdminServices.jsx';
import { AdminStaffScheduling } from './screens/AdminStaffScheduling.jsx';
import { AdminInventory } from './screens/AdminInventory.jsx';
import { AdminTasks } from './screens/AdminTasks.jsx';
import { AdminNotifications } from './screens/AdminNotifications.jsx';
import { AdminAnalytics } from './screens/AdminAnalytics.jsx';
import { AdminSettings } from './screens/AdminSettings.jsx';

// Import SIMPLE components (no dependency conflicts)
import { SimpleARPreview } from './components/Mobile/SimpleARPreview';
import { SimpleChatbot } from './components/Mobile/SimpleChatbot';
import { CustomerBooking } from './screens/CustomerBooking.jsx';
import { CustomerGallery } from './screens/CustomerGallery.jsx';

// Import OTP Component
import { OTPVerification } from './components/OTPVerification';

// Import API
import { loginUser, registerUser, sendOTP, resetUserPassword, deleteArtistWork, saveAuthToken } from './src/utils/api';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Simple Artist Client Details Screen
const ArtistClientDetailsScreen = ({ navigation, route }) => {
  const { client, session } = route.params || {};
  const targetId = client?.id || session?.customer_id;
  const [details, setDetails] = useState(null);
  
  useEffect(() => {
    if (targetId) {
      // Always use the production Render backend URL
      const baseUrl = 'https://inkvistar-api.onrender.com';
      fetch(`${baseUrl}/api/customer/profile/${targetId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setDetails(data.profile);
        })
        .catch(err => console.error('Error fetching client details:', err));
    }
  }, [targetId]);
  
  // Use display name from session or client
  const displayName = session?.client_name || client?.name || details?.name || 'Unknown Client';
  const displayEmail = session?.client_email || client?.email || details?.email || 'No email';

  return (
    <View style={{ flex: 1, backgroundColor: 'white', padding: 20, paddingTop: 50 }}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="arrow-back" size={24} color="#333" />
        <Text style={{ marginLeft: 10, fontSize: 16, color: '#333' }}>Back</Text>
      </TouchableOpacity>
      
      <View style={{ alignItems: 'center', marginBottom: 30 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#daa520', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
          <Text style={{ fontSize: 32, color: 'white', fontWeight: 'bold' }}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937' }}>{displayName}</Text>
        <Text style={{ fontSize: 16, color: '#6b7280' }}>{displayEmail}</Text>
      </View>
      
      {session && (
        <View style={{ backgroundColor: '#fff7ed', borderRadius: 12, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#fbbf24' }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#b45309' }}>Session Details</Text>
          
          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#b45309' }}>Date</Text>
            <Text style={{ fontSize: 16, color: '#78350f', fontWeight: 'bold' }}>{session.appointment_date}</Text>
          </View>

          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#b45309' }}>Time</Text>
            <Text style={{ fontSize: 16, color: '#78350f', fontWeight: 'bold' }}>{session.start_time}</Text>
          </View>

          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#b45309' }}>Design</Text>
            <Text style={{ fontSize: 16, color: '#78350f', fontWeight: 'bold' }}>{session.design_title}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#b45309' }}>Status</Text>
            <Text style={{ fontSize: 16, color: '#78350f', fontWeight: 'bold', textTransform: 'uppercase' }}>{session.status}</Text>
          </View>
        </View>
      )}

      <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#111' }}>Contact Information</Text>
        
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Phone</Text>
          <Text style={{ fontSize: 16, color: '#1f2937' }}>{details?.phone || client?.phone || 'Not provided'}</Text>
        </View>
        
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Location</Text>
          <Text style={{ fontSize: 16, color: '#1f2937' }}>{details?.location || 'Not provided'}</Text>
        </View>

        <View>
          <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Notes</Text>
          <Text style={{ fontSize: 16, color: '#1f2937' }}>{details?.notes || 'No notes available'}</Text>
        </View>
      </View>
      
      <TouchableOpacity 
        style={{ backgroundColor: '#daa520', padding: 15, borderRadius: 10, alignItems: 'center' }}
        onPress={() => Alert.alert('Coming Soon', 'Booking directly from client profile will be available soon.')}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Book Appointment</Text>
      </TouchableOpacity>
    </View>
  );
};

// Artist Appointment Details Screen
const ArtistAppointmentDetailsScreen = ({ navigation, route }) => {
  const { appointment } = route.params || {};

  if (!appointment) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <Text>No appointment data found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, padding: 10, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
          <Text>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white', paddingTop: 50 }}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 20, marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="arrow-back" size={24} color="#333" />
        <Text style={{ marginLeft: 10, fontSize: 16, color: '#333' }}>Back to Schedule</Text>
      </TouchableOpacity>
      
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 }}>{appointment.design_title || 'Appointment Details'}</Text>
        <Text style={{ fontSize: 16, color: '#6b7280', marginBottom: 20 }}>For: {appointment.client_name}</Text>

        {appointment.reference_image && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 10, color: '#111' }}>Reference Image</Text>
            <Image 
              source={{ uri: appointment.reference_image }} 
              style={{ width: '100%', height: 300, borderRadius: 12, backgroundColor: '#f3f4f6' }}
              resizeMode="contain"
            />
          </View>
        )}

        <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 15, color: '#111' }}>Details</Text>
          
          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>Date</Text>
            <Text style={{ fontSize: 16, color: '#1f2937', fontWeight: '500' }}>{new Date(appointment.appointment_date).toLocaleDateString()}</Text>
          </View>

          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>Time</Text>
            <Text style={{ fontSize: 16, color: '#1f2937', fontWeight: '500' }}>{appointment.start_time}</Text>
          </View>

          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>Status</Text>
            <Text style={{ fontSize: 16, color: '#1f2937', fontWeight: 'bold', textTransform: 'capitalize' }}>{appointment.status}</Text>
          </View>

          <View>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Client Notes</Text>
            <Text style={{ fontSize: 16, color: '#1f2937' }}>{appointment.notes || 'No notes provided.'}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [showOTP, setShowOTP] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginUserType, setLoginUserType] = useState('customer');
  
  useEffect(() => {
    console.log('👤 User state changed:', user ? `Logged in as ${user.name}` : 'Not logged in');
  }, [user]);
  
  const hideNavigationBar = () => {
    // Re-hides the navigation bar when the user interacts with the app
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync("hidden");
    }
  };
  
  useEffect(() => {
    console.log('🚀 App starting - ensuring clean state');
    setUser(null);

    // Hide Android system navigation bar to prevent blocking bottom tabs
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync("hidden");
      NavigationBar.setBehaviorAsync("overlay-swipe");
    }
  }, []); // This effect runs only once on mount

  const handleResendVerification = async (email) => {
    try {
      // Always use the production Render backend URL
      const baseUrl = 'https://inkvistar-api.onrender.com';
      const response = await fetch(`${baseUrl}/api/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const result = await response.json();
      if (result.success) {
        Alert.alert('Success', result.message);
      } else {
        Alert.alert('Error', result.message || 'Failed to resend link');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
    }
  };

  const handleLogin = async (email, password, userType) => {
    console.log('🔐 REAL LOGIN ATTEMPT with:', { email, userType });
    
    const result = await loginUser(email, password, userType);
    console.log('🔐 API RESPONSE:', result);
    
    if (result && result.success === true && result.user && result.user.name) {
      console.log(`✅ Login successful for ${result.user.email}`);
      if (result.token) {
        await saveAuthToken(result.token);
      }
      setUser(result.user);
    } else {
      console.log('❌ INVALID login - NOT setting user');
      if (result?.requireVerification) {
        Alert.alert(
          'Verification Required',
          result.message,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Resend Link', onPress: () => handleResendVerification(email) }
          ]
        );
      } else {
        alert('Login failed: ' + (result?.message || 'Invalid credentials'));
      }
    }
    return result;
  };

  const handleForgotPassword = async (email, type) => {
    const selectedType = type || 'customer';
    const result = await sendOTP(email, selectedType);
    
    if (result.success) {
      setLoginEmail(email);
      setLoginUserType(selectedType);
      setIsResetMode(true);
      setShowOTP(true);
    } else {
      alert(result.message || 'Failed to send OTP. Account may not exist.');
    }
  };

  const handleOTPVerified = (verifiedUser) => {
    console.log('✅ OTP Verified for user:', verifiedUser);
    if (isResetMode) {
      setShowOTP(false);
      setShowResetPassword(true);
    } else {
      setUser(verifiedUser);
      setShowOTP(false);
    }
  };

  const handlePasswordReset = async (newPassword) => {
    const result = await resetUserPassword(loginEmail, newPassword);
    if (result.success) {
      alert('Password updated successfully! Please login.');
      setShowResetPassword(false);
      setIsResetMode(false);
      // Navigate back to login implicitly by clearing states
    } else {
      alert('Failed to update password: ' + result.message);
    }
  };

  const handleRegister = async (name, email, password, phone, userType, navigation) => {
    console.log('📝 Register attempt:', { name, email, phone, userType });
    
    const registerResult = await registerUser(name, email, password, userType, phone);
    console.log('📝 Register result:', registerResult);
    
    if (registerResult.success && registerResult.message) {
      // Use the server's message, which is more accurate (e.g., "check your email")
      if (navigation) {
        navigation.navigate('login', { 
          prefillEmail: email,
          message: registerResult.message
        });
      }
    } else {
      alert('Registration failed: ' + (registerResult.message || 'Please try again'));
    }
    return registerResult;
  };

  // Customer Tab Navigator
  const CustomerTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#ffffff', 
          borderTopColor: '#e5e7eb',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: '#daa520',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Gallery') iconName = focused ? 'images' : 'images-outline';
          else if (route.name === 'AR') iconName = focused ? 'camera' : 'camera-outline';
          else if (route.name === 'Chat') iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          else if (route.name === 'Appointments') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home">
        {(props) => <CustomerDashboard {...props} userName={user.name} userId={user.id} onNavigate={props.navigation.navigate} onLogout={() => setUser(null)} />}
      </Tab.Screen>
      <Tab.Screen name="Gallery">
        {(props) => <CustomerGallery {...props} onBack={() => props.navigation.navigate('Home')} />}
      </Tab.Screen>
      <Tab.Screen name="AR">
        {(props) => <SimpleARPreview {...props} selectedDesign={{ name: 'Sample', type: 'Preview' }} onBack={() => props.navigation.navigate('Home')} />}
      </Tab.Screen>
      <Tab.Screen name="Chat" component={ChatScreen} initialParams={{ room: 'test_room', currentUser: `customer_${user.id}` }}/>
      <Tab.Screen name="Appointments">
        {(props) => <CustomerAppointments {...props} customerId={user.id} onBack={() => props.navigation.navigate('Home')} onBookNew={() => props.navigation.navigate('booking-create')} />}
      </Tab.Screen>
      <Tab.Screen name="Profile">
        {(props) => <CustomerProfilePage {...props} userName={user.name} userEmail={user.email} userId={user.id} onBack={() => props.navigation.navigate('Home')} onLogout={() => setUser(null)} />}
      </Tab.Screen>
    </Tab.Navigator>
  );

  // Admin Tab Navigator
  const AdminTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#1f2937', // Dark theme for admin
          borderTopColor: '#374151',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: '#f59e0b', // Amber
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') iconName = focused ? 'shield' : 'shield-outline';
          else if (route.name === 'Users') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Bookings') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'System') iconName = focused ? 'server' : 'server-outline';
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard">
        {(props) => <AdminDashboard {...props} onLogout={() => setUser(null)} />}
      </Tab.Screen>
      <Tab.Screen name="Users" component={AdminUserManagement} />
      <Tab.Screen name="Bookings" component={AdminAppointmentManagement} />
      <Tab.Screen name="System" component={AdminSystemHealth} />
    </Tab.Navigator>
  );

  // Artist Tab Navigator
  const ArtistTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { 
          backgroundColor: '#ffffff', 
          borderTopColor: '#e5e7eb',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: '#daa520',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Schedule') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Clients') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Works') iconName = focused ? 'images' : 'images-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home">
        {(props) => <ArtistDashboard {...props} userName={user.name} userEmail={user.email} userId={user.id} onNavigate={props.navigation.navigate} onLogout={() => setUser(null)} />}
      </Tab.Screen>
      <Tab.Screen name="Schedule">
        {(props) => <ArtistSchedule {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
      </Tab.Screen>
      <Tab.Screen name="Clients">
        {(props) => <ArtistClients {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
      </Tab.Screen>
      <Tab.Screen name="Works">
        {(props) => <ArtistWorks {...props} artistId={user.id} onBack={() => props.navigation.navigate('Home')} />}
      </Tab.Screen>
      <Tab.Screen name="Profile">
        {(props) => <ArtistProfile {...props} userId={user.id} userName={user.name} userEmail={user.email} onBack={() => props.navigation.navigate('Home')} onLogout={() => setUser(null)} />}
      </Tab.Screen>
    </Tab.Navigator>
  );

  return (
    <View style={{ flex: 1 }} onTouchStart={Platform.OS === 'android' ? hideNavigationBar : undefined}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            // LOGGED IN (User is set)
            user.type === 'admin' ? (
              // ADMIN Screens
              <>
              <Stack.Screen name="admin-main" component={AdminTabs} />
              
              <Stack.Screen name="admin-services" component={AdminServices} />
              <Stack.Screen name="admin-staff" component={AdminStaffScheduling} />
              <Stack.Screen name="admin-inventory" component={AdminInventory} />
              <Stack.Screen name="admin-tasks" component={AdminTasks} />
              <Stack.Screen name="admin-notifications" component={AdminNotifications} />
              <Stack.Screen name="admin-analytics" component={AdminAnalytics} />
              <Stack.Screen name="admin-settings" component={AdminSettings} />
              </>
            
            ) : user.type === 'artist' ? (
             // ARTIST Screens
              <>
                {/* Main Tab Navigator for Artist */}
                <Stack.Screen name="artist-main" component={ArtistTabs} />
                
                {/* Stack screens that sit on top of tabs */}
                <Stack.Screen name="artist-earnings">
                  {(props) => (
                    <ArtistEarnings
                      {...props}
                      artistId={user.id}
                      onBack={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="artist-notifications">
                  {(props) => (
                    <ArtistNotifications
                      {...props}
                      userId={user.id}
                      onBack={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="artist-client-details" component={ArtistClientDetailsScreen} />

                <Stack.Screen name="artist-appointment-details" component={ArtistAppointmentDetailsScreen} />

                <Stack.Screen name="artist-work-details">
                  {(props) => (
                    <View style={{flex:1, backgroundColor:'white', justifyContent:'center', alignItems:'center'}}>
                      <Text>Work Details (Coming Soon)</Text>
                      
                      {/* TEMPORARY TEST BUTTON FOR SOFT DELETE */}
                      <TouchableOpacity 
                        style={{marginTop: 20, padding: 10, backgroundColor: 'red'}}
                        onPress={() => deleteArtistWork('test-id-123')}
                      >
                        <Text style={{color: 'white'}}>TEST SOFT DELETE</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => props.navigation.goBack()}><Text>Back</Text></TouchableOpacity>
                    </View>
                  )}
                </Stack.Screen>
              </>
            ) : (
              // CUSTOMER Screens
              <>
                {/* Main Tab Navigator for Customer */}
                <Stack.Screen name="customer-main" component={CustomerTabs} />

                {/* Stack screens that sit on top of tabs */}
                <Stack.Screen name="chatbot-enhanced">
                  {(props) => (
                    <SimpleChatbot
                      {...props}
                      onBack={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="customer-notifications">
                  {(props) => (
                    <CustomerNotifications
                      {...props}
                      userId={user.id}
                      onBack={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="booking-create">
                  {(props) => (
                    <CustomerBooking
                      {...props}
                      customerId={user.id}
                      onBack={() => props.navigation.goBack()}
                    />
                  )}
                </Stack.Screen>
              </>
            )
          ) : showOTP ? (
            // OTP SCREEN
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
            // RESET PASSWORD SCREEN
            <Stack.Screen name="reset-password">
              {(props) => (
                <ResetPasswordPage 
                  email={loginEmail}
                  onSubmit={handlePasswordReset}
                />
              )}
            </Stack.Screen>
          ) : (
            // Authentication screens
            <>
              <Stack.Screen name="login">
                {(props) => (
                  <LoginPage
                    {...props}
                    onLogin={(email, password, userType) => 
                      handleLogin(email, password, userType, props.navigation)
                    }
                    onForgotPassword={handleForgotPassword}
                    onSwitchToRegister={() => props.navigation.navigate('register')}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="register">
                {(props) => (
                  <RegisterPage
                    {...props}
                    onRegister={(name, email, password, phone, userType) => 
                      handleRegister(name, email, password, phone, userType, props.navigation)
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