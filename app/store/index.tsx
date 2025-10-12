import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function StoreIndexRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect visitors landing on /store to the public master store
    router.replace('/store/master');
  }, [router]);

  return null;
}


