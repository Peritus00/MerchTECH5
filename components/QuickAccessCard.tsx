
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2; // 16px padding on each side + 16px gap

interface QuickAccessCardProps {
  title: string;
  icon: string;
  onPress: () => void;
}

const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
  title,
  icon,
  onPress,
}) => {
  const getIconColor = (iconName: string) => {
    switch (iconName) {
      case 'support-agent': return '#10b981';
      case 'description': return '#3b82f6';
      case 'play-circle-filled': return '#ef4444';
      case 'forum': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, { width: cardWidth }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.iconContainer,
        { backgroundColor: getIconColor(icon) + '20' }
      ]}>
        <MaterialIcons
          name={icon as any}
          size={24}
          color={getIconColor(icon)}
        />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default QuickAccessCard;
