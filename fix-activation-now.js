// Quick fix script - you can copy/paste this into browser console
// Run this on your admin dashboard page (while logged in)

console.log('🔍 Starting activation code fix...');

// Step 1: Debug the current activation code
async function debugAndFix() {
    try {
        console.log('📋 Step 1: Debugging activation code...');
        
        // Get auth token from localStorage (adjust if stored differently)
        const authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
        
        if (!authToken) {
            console.error('❌ No auth token found. Please log in first.');
            return;
        }
        
        // Debug the activation code
        const debugResponse = await fetch('https://merchtech5-production.up.railway.app/api/debug/activation-code/KCCISPOYSQSB', {
            headers: { 
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!debugResponse.ok) {
            console.error('❌ Debug failed:', debugResponse.status, debugResponse.statusText);
            return;
        }
        
        const debugData = await debugResponse.json();
        console.log('🔍 Debug results:', debugData);
        
        // Check if we found the DJKINGCAKE slideshow
        if (debugData.djkingcakeSlideshow) {
            const targetId = debugData.djkingcakeSlideshow.id;
            console.log(`🎯 Found DJKINGCAKE CHAIN slideshow ID: ${targetId}`);
            console.log(`📊 Images in DJKINGCAKE: ${debugData.djkingcakeSlideshow.image_count}`);
            
            // Step 2: Fix the linkage
            console.log('🔧 Step 2: Fixing activation code linkage...');
            
            const fixResponse = await fetch('https://merchtech5-production.up.railway.app/api/debug/fix-activation-code/KCCISPOYSQSB', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ targetSlideshowId: targetId })
            });
            
            if (!fixResponse.ok) {
                console.error('❌ Fix failed:', fixResponse.status, fixResponse.statusText);
                const errorText = await fixResponse.text();
                console.error('Error details:', errorText);
                return;
            }
            
            const fixData = await fixResponse.json();
            console.log('✅ SUCCESS!', fixData.message);
            console.log('🎉 Activation code KCCISPOYSQSB now points to:', fixData.targetSlideshow.name);
            console.log('📸 Images available:', fixData.targetSlideshow.image_count);
            
            console.log('\n🚀 READY TO TEST!');
            console.log('Try the activation code now - it should show the working slideshow!');
            
        } else {
            console.error('❌ Could not find DJKINGCAKE CHAIN slideshow');
            console.log('Available slideshows:', debugData);
        }
        
    } catch (error) {
        console.error('❌ Error during fix:', error);
    }
}

// Run the fix
debugAndFix();
