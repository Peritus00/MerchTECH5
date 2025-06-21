import React from 'react';
import { useRouter } from 'next/router'; // Assuming Next.js for routing

function SettingsPage({ user }) {
  const router = useRouter();

  const QuickAccessCard = ({ title, description, icon, onPress }) => (
    <div
      style={{
        border: '1px solid #ccc',
        padding: '10px',
        margin: '10px',
        cursor: 'pointer',
      }}
      onClick={onPress}
    >
      <h3>{title}</h3>
      <p>{description}</p>
      <span>{icon}</span>
    </div>
  );

  return (
    <div>
      <h1>Settings</h1>
      <QuickAccessCard
        title="User Permissions"
        description="Manage user permissions and access levels"
        icon="👥"
        onPress={() => router.push('/settings/user-permissions')}
      />

      {user?.email === 'djjetfuel@gmail.com' && (
        <>
          <QuickAccessCard
            title="Master Store Manager"
            description="Manage all store products and inventory"
            icon="🏪"
            onPress={() => router.push('/settings/master-store-manager')}
          />

          <QuickAccessCard
            title="Enhanced Sales Reports"
            description="View detailed sales analytics and reports"
            icon="📊"
            onPress={() => router.push('/settings/enhanced-sales-reports')}
          />
        </>
      )}
    </div>
  );
}

export default SettingsPage;