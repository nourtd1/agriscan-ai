import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ScanResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Scan Result: {id}</Text>
    </View>
  );
}
