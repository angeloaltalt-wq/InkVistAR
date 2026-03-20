// src/utils/api.js - UPDATED VERSION
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://inkvistar-api.onrender.com/api';

// Enhanced fetch helper with better error handling
export const fetchAPI = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`; // This now correctly uses the dev or prod URL
  
  console.log(`📤 API Request: ${options.method || 'GET'} ${url}`);
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add auth token if available
  const token = await getAuthToken();
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers },
      timeout: 30000, // 30 second timeout
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`📥 API Response: ${response.status} (${responseTime}ms)`);
    
    // Handle empty responses
    if (response.status === 204) {
      return { success: true };
    }
    
    const text = await response.text();
    
    // Try to parse JSON
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error('❌ Failed to parse JSON:', text.substring(0, 200));
      return {
        success: false,
        message: 'Invalid server response',
        status: response.status,
        raw: text
      };
    }
    
    // Handle HTTP errors
    if (!response.ok) {
      return {
        success: false,
        message: data.message || `Server error: ${response.status}`,
        status: response.status,
        ...data
      };
    }
    
    return {
      success: true,
      ...data
    };
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
    console.log('Full error object:', error); // More detailed error for debugging
    
    // Check for specific network errors
    let errorMessage = 'Network error';
    if (error.message.includes('Network request failed')) {
      errorMessage = 'No internet connection';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Request timeout';
    } else {
      errorMessage = `Network error: ${error.message}`;
    }
    
    return {
      success: false,
      message: errorMessage,
      error: error.message
    };
  }
};

// Helper to get auth token from storage
const getAuthToken = async () => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

// Helper to save auth token
export const saveAuthToken = async (token) => {
  try {
    await AsyncStorage.setItem('auth_token', token);
    console.log('Auth token saved');
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
};

// Helper to remove auth token
export const removeAuthToken = async () => {
  try {
    await AsyncStorage.removeItem('auth_token');
    console.log('Auth token removed');
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
};

// Validation Helpers
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  // Remove leading/trailing whitespace to prevent " email@test.com " errors
  return input.trim();
};

// Test backend connection
export const testBackend = async () => {
  return fetchAPI('/test');
};

// Emergency Login (Network Test)
export const emergencyLogin = async (email, userType) => {
  const result = await fetchAPI('/emergency-login', {
    method: 'POST',
    body: JSON.stringify({
      email: email || 'test@example.com',
      type: userType || 'customer'
    })
  });
  return result;
};

// Login user
export const loginUser = async (email, password, userType) => {
  if (!email || !password) {
    return { success: false, message: 'Email and password are required' };
  }
  if (!isValidEmail(email)) {
    return { success: false, message: 'Invalid email format' };
  }

  const result = await fetchAPI('/login', {
    method: 'POST',
    body: JSON.stringify({
      email: sanitizeInput(email),
      password,
      type: userType
    })
  });
  
  return result;
};

// Reset Password
export const resetUserPassword = async (email, newPassword) => {
  return fetchAPI('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, newPassword })
  });
};

// Register user
export const registerUser = async (name, email, password, userType) => {
  if (!name || !email || !password) {
    return { success: false, message: 'All fields are required' };
  }
  if (!isValidEmail(email)) {
    return { success: false, message: 'Invalid email format' };
  }
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }

  const result = await fetchAPI('/register', {
    method: 'POST',
    body: JSON.stringify({
      name: sanitizeInput(name),
      email: sanitizeInput(email),
      password,
      type: userType
    })
  });
  
  return result;
};

// Artist: Get Portfolio
export const getArtistPortfolio = async (artistId) => {
  return fetchAPI(`/artist/${artistId}/portfolio`);
};

// Artist: Add Work
export const addArtistWork = async (artistId, workData) => {
  return fetchAPI('/artist/portfolio', {
    method: 'POST',
    body: JSON.stringify({ artistId, ...workData })
  });
};

// Artist: Delete Work (Soft Delete)
// Marks a portfolio work as deleted (soft delete)
export const deleteArtistWork = async (workId) => {
  // Requirement: Soft delete (mark as inactive) for audit trail
  return fetchAPI(`/artist/portfolio/${workId}`, {
    method: 'DELETE'
  });
};

// Artist: Update Work Visibility
export const updateArtistWorkVisibility = async (workId, isPublic) => {
  return fetchAPI(`/artist/portfolio/${workId}/visibility`, {
    method: 'PUT',
    body: JSON.stringify({ isPublic })
  });
};

// Artist: Get Appointments
export const getArtistAppointments = async (artistId, status = '', date = '') => {
  let endpoint = `/artist/${artistId}/appointments`;
  const params = [];
  if (status) params.push(`status=${status}`);
  if (date) params.push(`date=${date}`);
  
  if (params.length > 0) {
    endpoint += `?${params.join('&')}`;
  }
  return fetchAPI(endpoint);
};

// Artist: Update Appointment Status
export const updateAppointmentStatus = async (appointmentId, status) => {
  return fetchAPI(`/appointments/${appointmentId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
};

// Artist: Get Clients
export const getArtistClients = async (artistId) => {
  return fetchAPI(`/artist/${artistId}/clients`);
};

// Artist: Create Appointment
export const createArtistAppointment = async (appointmentData) => {
  return fetchAPI('/artist/appointments', {
    method: 'POST',
    body: JSON.stringify(appointmentData)
  });
};

// Artist: Add Client
export const addArtistClient = async (clientData) => {
  return fetchAPI('/artist/clients', {
    method: 'POST',
    body: JSON.stringify(clientData)
  });
};

// Artist: Delete Client (Soft Delete)
export const deleteArtistClient = async (clientId) => {
  // Requirement: Soft delete (mark as inactive) for audit trail
  return fetchAPI(`/artist/clients/${clientId}`, {
    method: 'PUT',
    body: JSON.stringify({ active: false, isDeleted: true })
  });
};

// Artist: Get Dashboard
export const getArtistDashboard = async (artistId) => {
  return fetchAPI(`/artist/dashboard/${artistId}`);
};

// Artist: Update Profile
export const updateArtistProfile = async (artistId, profileData) => {
  return fetchAPI(`/artist/profile/${artistId}`, {
    method: 'PUT',
    body: JSON.stringify(profileData)
  });
};

// Customer: Get Appointments
export const getCustomerAppointments = async (customerId) => {
  return fetchAPI(`/customer/${customerId}/appointments`);
};

// Customer: Get Dashboard
export const getCustomerDashboard = async (customerId) => {
  return fetchAPI(`/customer/dashboard/${customerId}`);
};

// Customer: Get Profile
export const getCustomerProfile = async (customerId) => {
  return fetchAPI(`/customer/profile/${customerId}`);
};

// Customer: Update Profile
export const updateCustomerProfile = async (customerId, profileData) => {
  return fetchAPI(`/customer/profile/${customerId}`, {
    method: 'PUT',
    body: JSON.stringify(profileData)
  });
};

// Customer: Get All Artists
// Supports search/filter params: { search: 'name', category: 'tattoo', sort: 'rating' }
export const getCustomerArtists = async (filters = {}) => {
  // Convert filter object to query string
  const queryParams = new URLSearchParams(filters).toString();
  const endpoint = queryParams ? `/customer/artists?${queryParams}` : '/customer/artists';
  return fetchAPI(endpoint);
};

// Customer: Get Artist Availability
export const getArtistAvailability = async (artistId) => {
  return fetchAPI(`/artist/${artistId}/availability`);
};

// Customer: Create Appointment
export const createCustomerAppointment = async (appointmentData) => {
  return fetchAPI('/customer/appointments', {
    method: 'POST',
    body: JSON.stringify(appointmentData)
  });
};

// Customer: Create Checkout Session
export const createCheckoutSession = async (appointmentId, amount) => {
  return fetchAPI('/payments/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ appointmentId, amount })
  });
};

// Customer: Check Payment Status (polls PayMongo if needed)
export const getPaymentStatus = async (appointmentId) => {
  return fetchAPI(`/appointments/${appointmentId}/payment-status`);
};

// Gallery: Get Works
// Supports search/filter params
export const getGalleryWorks = async (filters = {}) => {
  // Convert filter object to query string
  const queryParams = new URLSearchParams(filters).toString();
  const endpoint = queryParams ? `/gallery/works?${queryParams}` : '/gallery/works';
  return fetchAPI(endpoint);
};

// Get Notifications with pagination and filtering
export const getNotifications = async (userId, options = {}) => {
  const { page = 1, limit = 20, type } = options;
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('limit', limit);
  if (type) params.append('type', type);

  return fetchAPI(`/notifications/${userId}?${params.toString()}`);
};

// Mark Notification as Read
export const markNotificationAsRead = async (notificationId) => {
  return fetchAPI(`/notifications/${notificationId}/read`, {
    method: 'PUT'
  });
};

// Send OTP
export const sendOTP = async (email, userType) => {
  return fetchAPI('/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email, user_type: userType })
  });
};

// Verify OTP
export const verifyOTP = async (email, otp, userType) => {
  if (!otp || otp.length < 4) {
    return { success: false, message: 'Invalid OTP' };
  }

  const result = await fetchAPI('/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, user_type: userType })
  });

  // Save token if verification successful (Auto-login)
  if (result.success && result.token) {
    await saveAuthToken(result.token);
  }

  return result;
};

// Chatbot: Send Message
export const sendChatMessage = async (message) => {
  return fetchAPI('/chat', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
};

// =================================================================
// ADMIN-SPECIFIC API CALLS
// =================================================================

// Admin: Get Dashboard Data
export const getAdminDashboard = async () => {
  return fetchAPI('/admin/dashboard');
};

// Admin: Get All Users
export const getAllUsersForAdmin = async (filters = {}) => {
  const queryParams = new URLSearchParams(filters).toString();
  const endpoint = queryParams ? `/admin/users?${queryParams}` : '/admin/users';
  return fetchAPI(endpoint);
};

// Admin: Create User
export const createUserByAdmin = async (userData) => {
  return fetchAPI('/admin/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
};

// Admin: Update a User's Details
export const updateUserByAdmin = async (userId, userData) => {
  return fetchAPI(`/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(userData),
  });
};

// Admin: Delete a User (can be soft or hard delete based on backend)
export const deleteUserByAdmin = async (userId) => {
  return fetchAPI(`/admin/users/${userId}`, {
    method: 'DELETE',
  });

};

// Admin: Get All Appointments
export const getAllAppointmentsForAdmin = async () => {
  return fetchAPI('/admin/appointments');
};

// Admin: Update Appointment (Status, Date, Time)
export const updateAppointmentByAdmin = async (apptId, data) => {

  return fetchAPI(`/admin/appointments/${apptId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

// Admin: Delete Appointment
export const deleteAppointmentByAdmin = async (apptId) => {

  return fetchAPI(`/admin/appointments/${apptId}`, {
    method: 'DELETE',
  });
};

// Logout user
export const logoutUser = async () => {
  await removeAuthToken();
  return { success: true };
};

// Get all users (for debugging)
export const getAllUsers = async () => {
  return fetchAPI('/users');
};

// Check if user is authenticated
export const isAuthenticated = async () => {
  const token = await getAuthToken();
  return !!token;
};