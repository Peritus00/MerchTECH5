
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import HeaderWithLogo from '@/components/HeaderWithLogo';
import ResourceCard from '@/components/ResourceCard';
import QuickAccessCard from '@/components/QuickAccessCard';

interface Resource {
  url: string;
  name: string;
  description: string;
  category: string;
  featured?: boolean;
}

const ResourcesScreen = () => {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const resourceCategories: Record<string, Resource[]> = {
    distribution: [
      { url: "https://www.etsy.com", name: "Etsy", description: "Print your codes on merch", category: "distribution" },
      { url: "https://www.cdbaby.com", name: "CDBABY", description: "Digital Distribution for releases", category: "distribution" },
      { url: "https://distrokid.com", name: "DistroKid", description: "Music distribution to streaming platforms", category: "distribution" },
      { url: "https://www.tunecore.com", name: "TuneCore", description: "Digital music distribution service", category: "distribution" },
    ],
    legal: [
      { url: "https://www.ascap.com/songview", name: "SONGVIEW ASCAP/BMI", description: "Copyright database for sampling", category: "legal" },
      { url: "https://copyright.gov/", name: "US Copyright Office", description: "Copyright your intellectual property", category: "legal" },
      { url: "https://www.avvo.com", name: "Avvo", description: "Find Lawyers for anything", category: "legal" },
      { url: "https://www.lawdepot.com", name: "Law Depot", description: "Familiarize yourself with contracts", category: "legal" },
      { url: "https://www.legalzoom.com", name: "LegalZoom", description: "Business formation and legal services", category: "legal" },
    ],
    production: [
      { url: "https://www.landr.com", name: "Landr", description: "Mastering services & Cover Song licensing", category: "production", featured: true },
      { url: "https://www.splice.com", name: "Splice", description: "Royalty free samples for production", category: "production", featured: true },
      { url: "https://www.vizzy.io", name: "Vizzy", description: "Music Video Maker", category: "production" },
      { url: "https://www.image-line.com/fl-studio/", name: "FL Studio", description: "Digital audio workstation for music production", category: "production" },
      { url: "https://www.ableton.com", name: "Ableton Live", description: "Professional music production software", category: "production" },
      { url: "https://www.pro-tools.com", name: "Pro Tools", description: "Industry standard audio editing software", category: "production" },
    ],
    business: [
      { url: "https://www.sba.gov/business-guide/plan-your-business/write-your-business-plan", name: "SBA Business Guide", description: "Write your business plan", category: "business" },
      { url: "https://www.quickbooks.com", name: "QuickBooks", description: "Accounting and financial management", category: "business" },
      { url: "https://www.freshbooks.com", name: "FreshBooks", description: "Invoicing and expense tracking", category: "business" },
      { url: "https://www.shopify.com", name: "Shopify", description: "E-commerce platform for selling merchandise", category: "business" },
    ],
    marketing: [
      { url: "https://www.hootsuite.com", name: "Hootsuite", description: "Social media management platform", category: "marketing", featured: true },
      { url: "https://www.canva.com", name: "Canva", description: "Design platform for promotional materials", category: "marketing", featured: true },
      { url: "https://mailchimp.com", name: "Mailchimp", description: "Email marketing and automation", category: "marketing" },
      { url: "https://www.google.com/analytics", name: "Google Analytics", description: "Website and audience analytics", category: "marketing" },
      { url: "https://buffer.com", name: "Buffer", description: "Social media scheduling and analytics", category: "marketing" },
    ],
    education: [
      { url: "https://www.coursera.org/browse/arts-and-humanities/music-and-art", name: "Coursera Music Courses", description: "Online music and business courses", category: "education" },
      { url: "https://www.berklee.edu/online", name: "Berklee Online", description: "Professional music education", category: "education" },
      { url: "https://www.youtube.com/user/recordingrevolution", name: "Recording Revolution", description: "Free music production tutorials", category: "education" },
      { url: "https://www.masterclass.com/categories/music-and-entertainment", name: "MasterClass", description: "Learn from industry professionals", category: "education" },
    ],
  };

  const quickAccessItems = [
    { title: "Contact Support", icon: "support-agent", action: () => handleContactSupport() },
    { title: "Documentation", icon: "description", action: () => handleOpenDocs() },
    { title: "Video Tutorials", icon: "play-circle-filled", action: () => handleOpenTutorials() },
    { title: "Community Forum", icon: "forum", action: () => handleOpenForum() },
  ];

  const categories = [
    { key: 'all', label: 'All Resources', icon: 'grid-view' },
    { key: 'distribution', label: 'Distribution', icon: 'cloud-upload' },
    { key: 'legal', label: 'Legal', icon: 'gavel' },
    { key: 'production', label: 'Production', icon: 'music-note' },
    { key: 'business', label: 'Business', icon: 'business' },
    { key: 'marketing', label: 'Marketing', icon: 'campaign' },
    { key: 'education', label: 'Education', icon: 'school' },
  ];

  const getAllResources = (): Resource[] => {
    return Object.values(resourceCategories).flat();
  };

  const getFilteredResources = () => {
    let resources = activeCategory === 'all' 
      ? getAllResources() 
      : resourceCategories[activeCategory] || [];

    if (searchQuery) {
      resources = resources.filter(resource =>
        resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return resources;
  };

  const getFeaturedResources = () => {
    return getAllResources().filter(resource => resource.featured);
  };

  const handleOpenResource = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this URL');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open resource');
    }
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:help@merchtech.net?subject=Support Request');
  };

  const handleOpenDocs = () => {
    handleOpenResource('https://docs.merchtech.net');
  };

  const handleOpenTutorials = () => {
    handleOpenResource('https://www.youtube.com/c/merchtech');
  };

  const handleOpenForum = () => {
    handleOpenResource('https://community.merchtech.net');
  };

  const filteredResources = getFilteredResources();
  const featuredResources = getFeaturedResources();

  return (
    <View style={styles.container}>
      {/* Header */}
      <HeaderWithLogo
        title="Resources"
        subtitle="Tools & Services for Artists"
        onRightButtonPress={() => router.push('/settings/profile')}
        rightButtonIcon="account-circle"
        rightButtonColor="#6b7280"
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Resources for Artists</Text>
          <Text style={styles.heroSubtitle}>
            A curated collection of valuable tools and services to help you create, promote, and manage your art.
          </Text>
        </View>

        {/* Quick Access */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.quickAccessGrid}>
            {quickAccessItems.map((item, index) => (
              <QuickAccessCard
                key={index}
                title={item.title}
                icon={item.icon}
                onPress={item.action}
              />
            ))}
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search resources..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="clear" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryTabs}
          contentContainerStyle={styles.categoryTabsContent}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={[
                styles.categoryTab,
                activeCategory === category.key && styles.activeCategoryTab,
              ]}
              onPress={() => setActiveCategory(category.key)}
            >
              <MaterialIcons
                name={category.icon as any}
                size={20}
                color={activeCategory === category.key ? '#fff' : '#6b7280'}
              />
              <Text
                style={[
                  styles.categoryTabText,
                  activeCategory === category.key && styles.activeCategoryTabText,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Resources */}
        {activeCategory === 'all' && !searchQuery && featuredResources.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured Resources</Text>
            <View style={styles.featuredGrid}>
              {featuredResources.map((resource, index) => (
                <ResourceCard
                  key={index}
                  resource={resource}
                  onPress={() => handleOpenResource(resource.url)}
                  featured
                />
              ))}
            </View>
          </View>
        )}

        {/* Resources List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeCategory === 'all' ? 'All Resources' : categories.find(c => c.key === activeCategory)?.label}
            {searchQuery && ` (${filteredResources.length} results)`}
          </Text>
          
          {filteredResources.length > 0 ? (
            <View style={styles.resourcesList}>
              {filteredResources.map((resource, index) => (
                <ResourceCard
                  key={index}
                  resource={resource}
                  onPress={() => handleOpenResource(resource.url)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={64} color="#9ca3af" />
              <Text style={styles.emptyText}>No resources found</Text>
              <Text style={styles.emptySubtext}>
                Try adjusting your search terms or browse different categories
              </Text>
            </View>
          )}
        </View>

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Need More Help?</Text>
          <Text style={styles.helpText}>
            Can't find what you're looking for? Our support team is here to help you succeed.
          </Text>
          <TouchableOpacity style={styles.contactButton} onPress={handleContactSupport}>
            <MaterialIcons name="email" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  categoryTabs: {
    marginBottom: 8,
  },
  categoryTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  activeCategoryTab: {
    backgroundColor: '#3b82f6',
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeCategoryTabText: {
    color: '#fff',
  },
  featuredGrid: {
    gap: 12,
  },
  resourcesList: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  helpSection: {
    backgroundColor: '#3b82f6',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  helpTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 14,
    color: '#dbeafe',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e40af',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ResourcesScreen;
