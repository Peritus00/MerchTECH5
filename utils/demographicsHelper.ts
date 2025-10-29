/**
 * Demographics Helper
 * Unified logic for checking and managing user demographics (age + gender)
 */

import { getUserAge } from './ageStorage';
import { getUserGender } from './genderStorage';
import { usersAPI } from '@/services/api';

export interface Demographics {
  ageRange: string;
  gender: string;
}

/**
 * Check if we should show demographics survey
 * For authenticated users: checks user profile
 * For anonymous users: checks localStorage
 * 
 * @param isAuthenticated - Whether user is logged in
 * @param userDemographics - Demographics from user profile (if authenticated)
 * @returns true if survey should be shown
 */
export async function shouldShowDemographicsSurvey(
  isAuthenticated: boolean,
  userDemographics?: { ageRange?: string | null; gender?: string | null } | null
): Promise<boolean> {
  // For authenticated users, check their profile
  if (isAuthenticated) {
    // If demographics are provided and both fields exist, don't show survey
    if (userDemographics?.ageRange && userDemographics?.gender) {
      return false;
    }
    // Missing demographics in profile, show survey
    return true;
  }
  
  // For anonymous users, check localStorage
  const age = getUserAge();
  const gender = getUserGender();
  
  // If both exist and are not expired, don't show survey
  if (age && gender) {
    return false;
  }
  
  // Missing demographics in localStorage, show survey
  return true;
}

/**
 * Get demographics for analytics tracking
 * Checks user profile first (if authenticated), then localStorage
 * 
 * @param isAuthenticated - Whether user is logged in
 * @param userDemographics - Demographics from user profile (if authenticated)
 * @returns Demographics object or null
 */
export function getDemographicsForTracking(
  isAuthenticated: boolean,
  userDemographics?: { ageRange?: string | null; gender?: string | null } | null
): Partial<Demographics> | null {
  // For authenticated users, use profile data
  if (isAuthenticated && userDemographics) {
    return {
      ageRange: userDemographics.ageRange || undefined,
      gender: userDemographics.gender || undefined,
    };
  }
  
  // For anonymous users, use localStorage
  const age = getUserAge();
  const gender = getUserGender();
  
  if (!age && !gender) {
    return null;
  }
  
  return {
    ageRange: age?.ageRange,
    gender: gender?.gender,
  };
}

/**
 * Fetch authenticated user's demographics from server
 */
export async function fetchUserDemographics(): Promise<{ ageRange?: string; gender?: string; hasData: boolean } | null> {
  try {
    const response = await usersAPI.getDemographics();
    return response;
  } catch (error) {
    console.error('Error fetching user demographics:', error);
    return null;
  }
}

/**
 * Save demographics based on user authentication status
 * @param demographics - Age range and gender to save
 * @param isAuthenticated - Whether user is logged in
 * @param saveToLocalStorage - Function to save to localStorage (for anonymous users)
 */
export async function saveDemographics(
  demographics: Demographics,
  isAuthenticated: boolean,
  saveToLocalStorage: (ageRange: string, gender: string) => void
): Promise<boolean> {
  try {
    if (isAuthenticated) {
      // Save to user profile on server
      await usersAPI.updateDemographics(demographics.ageRange, demographics.gender);
      console.log('✅ Demographics saved to user profile');
      return true;
    } else {
      // Save to localStorage for anonymous users
      saveToLocalStorage(demographics.ageRange, demographics.gender);
      console.log('✅ Demographics saved to localStorage');
      return true;
    }
  } catch (error) {
    console.error('❌ Error saving demographics:', error);
    return false;
  }
}

