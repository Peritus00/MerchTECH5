interface ColorPalette {
  name: string;
  foregroundColor: string;
  backgroundColor: string;
  description: string;
  category: 'professional' | 'creative' | 'bold' | 'minimal' | 'brand';
}

interface ColorSuggestionRequest {
  contentType: 'url' | 'text' | 'email' | 'phone' | 'playlist' | 'slideshow' | 'store';
  content?: string;
  brandColors?: string[];
  style?: 'professional' | 'creative' | 'minimal' | 'bold';
}

class AIColorService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  constructor() {
    // Fix the API key retrieval to handle both possible environment variable names
    const publicKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    const privateKey = process.env.GEMINI_API_KEY;
    
    // Get the raw key and sanitize it
    const rawKey = publicKey || privateKey || '';
    
    // Remove any quotes, whitespace, or extra characters that might be in the env var
    this.apiKey = rawKey.replace(/['"]/g, '').trim();
    
    // Debug logging to check the key format (remove in production)
    if (this.apiKey) {
      console.log('🔑 Gemini API key loaded:', this.apiKey.substring(0, 10) + '...');
      console.log('🔍 Full key length:', this.apiKey.length);
    } else {
      console.warn('⚠️ No Gemini API key found in environment variables');
      console.log('🔍 Raw env vars:', { publicKey, privateKey });
    }
  }

  async generateColorSuggestions(request: ColorSuggestionRequest): Promise<ColorPalette[]> {
    if (!this.apiKey) {
      console.warn('🎨 Gemini API key not found, using enhanced fallback colors');
      return this.getEnhancedFallbackColors(request.contentType, request.style);
    }

    try {
      const prompt = this.buildColorPrompt(request);
      const url = `${this.baseUrl}?key=${this.apiKey}`;
      
      console.log('🌐 Making API request to Gemini for color suggestions...');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🚫 API Error Response:', errorText);
        
        // Handle specific quota exceeded error
        if (response.status === 429) {
          console.warn('⏰ API quota exceeded, using enhanced fallback colors');
          return this.getEnhancedFallbackColors(request.contentType, request.style);
        }
        
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        throw new Error('No response from AI');
      }

      console.log('✅ AI color suggestions generated successfully');
      return this.parseColorResponse(generatedText, request.contentType);
    } catch (error) {
      console.error('❌ Error generating AI color suggestions:', error);
      console.log('🎨 Falling back to enhanced color suggestions');
      return this.getEnhancedFallbackColors(request.contentType, request.style);
    }
  }

  private buildColorPrompt(request: ColorSuggestionRequest): string {
    const { contentType, content, brandColors, style } = request;
    
    let prompt = `Create 6 VIBRANT and EXCITING QR code color combinations for a ${contentType} QR code that will grab attention and look amazing! `;
    
    if (content) {
      prompt += `The content is: "${content}". `;
    }
    
    if (brandColors && brandColors.length > 0) {
      prompt += `Consider these brand colors: ${brandColors.join(', ')}. `;
    }
    
    if (style) {
      prompt += `The desired style is ${style}. `;
    }

    prompt += `
IMPORTANT: Make these colors POP! Think Instagram-worthy, eye-catching, modern designs that people will want to scan. Avoid boring grays, muted tones, or corporate colors unless specifically requested.

For each color combination, provide:
1. A creative, catchy name (like "Electric Sunset" or "Neon Dreams")
2. Foreground color (hex code) - make it BOLD and VIBRANT
3. Background color (hex code) - complementary and striking
4. Exciting description of why it's awesome
5. Category (professional, creative, bold, minimal, or brand)

MUST maintain high contrast for QR code readability while being visually stunning!

Format as JSON array:
[
  {
    "name": "Electric Sunset",
    "foregroundColor": "#FF6B35",
    "backgroundColor": "#FFF8E7",
    "description": "Energetic orange that commands attention with warm cream backdrop",
    "category": "bold"
  }
]

Focus on creating combinations that are:
- VISUALLY STRIKING and attention-grabbing
- Modern and trendy (think 2025 design trends)
- Instagram/social media ready
- Emotionally engaging and memorable
- Perfect contrast for scanning
- Colors that make people say "WOW!"

Think: gradient-inspired, neon-bright, sunset colors, electric blues, vibrant purples, energetic oranges, tropical greens, hot pinks - but always with proper contrast for QR functionality!`;

    return prompt;
  }

  private parseColorResponse(response: string, contentType: string): ColorPalette[] {
    try {
      // Extract JSON from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const colorData = JSON.parse(jsonMatch[0]);
      
      // Validate and clean the data
      return colorData.map((item: any, index: number) => ({
        name: item.name || `Color Combo ${index + 1}`,
        foregroundColor: this.validateHexColor(item.foregroundColor) || '#000000',
        backgroundColor: this.validateHexColor(item.backgroundColor) || '#FFFFFF',
        description: item.description || 'AI-generated color combination',
        category: this.validateCategory(item.category) || 'professional',
      })).slice(0, 6); // Limit to 6 suggestions
    } catch (error) {
      console.error('Error parsing AI color response:', error);
      return this.getFallbackColors(contentType);
    }
  }

  private validateHexColor(color: string): string | null {
    if (!color || typeof color !== 'string') return null;
    
    // Remove any whitespace and ensure it starts with #
    const cleanColor = color.trim();
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    
    if (hexPattern.test(cleanColor)) {
      return cleanColor.toUpperCase();
    }
    
    return null;
  }

  private validateCategory(category: string): ColorPalette['category'] {
    const validCategories: ColorPalette['category'][] = ['professional', 'creative', 'bold', 'minimal', 'brand'];
    return validCategories.includes(category as ColorPalette['category']) ? category as ColorPalette['category'] : 'professional';
  }

  private getEnhancedFallbackColors(contentType: string, style?: string): ColorPalette[] {
    const contentSpecificColors = this.getContentSpecificColors(contentType);
    const styleSpecificColors = this.getStyleSpecificColors(style);
    const universalColors = this.getUniversalColors();

    // Combine and return 6 unique colors
    const allColors = [...contentSpecificColors, ...styleSpecificColors, ...universalColors];
    const uniqueColors = allColors.filter((color, index, self) => 
      index === self.findIndex(c => c.name === color.name)
    );

    return uniqueColors.slice(0, 6);
  }

  private getContentSpecificColors(contentType: string): ColorPalette[] {
    switch (contentType) {
      case 'url':
        return [
          {
            name: 'Cyber Electric',
            foregroundColor: '#0066FF',
            backgroundColor: '#E6F3FF',
            description: 'Electric blue that screams digital innovation',
            category: 'bold',
          },
          {
            name: 'Neon Link',
            foregroundColor: '#8B5CF6',
            backgroundColor: '#F3E8FF',
            description: 'Vibrant purple that demands clicks',
            category: 'creative',
          },
        ];
      case 'email':
        return [
          {
            name: 'Message Burst',
            foregroundColor: '#3B82F6',
            backgroundColor: '#DBEAFE',
            description: 'Bright blue that gets messages noticed',
            category: 'bold',
          },
          {
            name: 'Inbox Lime',
            foregroundColor: '#10B981',
            backgroundColor: '#D1FAE5',
            description: 'Fresh lime that energizes communication',
            category: 'creative',
          },
        ];
      case 'phone':
        return [
          {
            name: 'Call Fire',
            foregroundColor: '#F97316',
            backgroundColor: '#FFF7ED',
            description: 'Blazing orange that demands attention',
            category: 'bold',
          },
          {
            name: 'Ring Emerald',
            foregroundColor: '#059669',
            backgroundColor: '#ECFDF5',
            description: 'Emerald green that sparkles with energy',
            category: 'creative',
          },
        ];
      case 'store':
        return [
          {
            name: 'Shopping Blaze',
            foregroundColor: '#EF4444',
            backgroundColor: '#FEF2F2',
            description: 'Red-hot deals that stop shoppers in their tracks',
            category: 'bold',
          },
          {
            name: 'Retail Sunset',
            foregroundColor: '#F59E0B',
            backgroundColor: '#FFFBEB',
            description: 'Golden sunset that makes purchases irresistible',
            category: 'brand',
          },
        ];
      case 'playlist':
        return [
          {
            name: 'Beat Drop',
            foregroundColor: '#A855F7',
            backgroundColor: '#FAF5FF',
            description: 'Purple that pulses with musical energy',
            category: 'creative',
          },
          {
            name: 'Rhythm Wave',
            foregroundColor: '#06B6D4',
            backgroundColor: '#F0F9FF',
            description: 'Cyan waves that flow with the beat',
            category: 'bold',
          },
        ];
      case 'slideshow':
        return [
          {
            name: 'Visual Pop',
            foregroundColor: '#EC4899',
            backgroundColor: '#FDF2F8',
            description: 'Hot pink that makes presentations unforgettable',
            category: 'bold',
          },
          {
            name: 'Gallery Glow',
            foregroundColor: '#8B5CF6',
            backgroundColor: '#F5F3FF',
            description: 'Glowing purple that highlights visual content',
            category: 'creative',
          },
        ];
      default:
        return [];
    }
  }

  private getStyleSpecificColors(style?: string): ColorPalette[] {
    switch (style) {
      case 'professional':
        return [
          {
            name: 'Executive Electric',
            foregroundColor: '#2563EB',
            backgroundColor: '#EFF6FF',
            description: 'Professional with modern energy',
            category: 'professional',
          },
          {
            name: 'Business Blaze',
            foregroundColor: '#059669',
            backgroundColor: '#ECFDF5',
            description: 'Sharp green that means business',
            category: 'professional',
          },
        ];
      case 'creative':
        return [
          {
            name: 'Artistic Fire',
            foregroundColor: '#DC2626',
            backgroundColor: '#FEF2F2',
            description: 'Passionate red that ignites creativity',
            category: 'creative',
          },
          {
            name: 'Creator Magic',
            foregroundColor: '#7C3AED',
            backgroundColor: '#F5F3FF',
            description: 'Magical purple that sparks imagination',
            category: 'creative',
          },
        ];
      case 'minimal':
        return [
          {
            name: 'Modern Midnight',
            foregroundColor: '#1F2937',
            backgroundColor: '#F9FAFB',
            description: 'Sleek dark contrast with clean appeal',
            category: 'minimal',
          },
          {
            name: 'Pure Focus',
            foregroundColor: '#374151',
            backgroundColor: '#FFFFFF',
            description: 'Crystal clear focus with perfect balance',
            category: 'minimal',
          },
        ];
      case 'bold':
        return [
          {
            name: 'Lightning Strike',
            foregroundColor: '#3B82F6',
            backgroundColor: '#DBEAFE',
            description: 'Electric blue that strikes with power',
            category: 'bold',
          },
          {
            name: 'Solar Flare',
            foregroundColor: '#F59E0B',
            backgroundColor: '#FFFBEB',
            description: 'Blazing orange that radiates energy',
            category: 'bold',
          },
        ];
      default:
        return [];
    }
  }

  private getUniversalColors(): ColorPalette[] {
    return [
      {
        name: 'Classic Black & White',
        foregroundColor: '#000000',
        backgroundColor: '#FFFFFF',
        description: 'Maximum contrast and readability',
        category: 'professional',
      },
      {
        name: 'Elegant Charcoal',
        foregroundColor: '#1F2937',
        backgroundColor: '#F9FAFB',
        description: 'Sophisticated and modern',
        category: 'minimal',
      },
    ];
  }

  private getFallbackColors(contentType: string): ColorPalette[] {
    const baseColors: ColorPalette[] = [
      {
        name: 'Classic Black & White',
        foregroundColor: '#000000',
        backgroundColor: '#FFFFFF',
        description: 'Maximum contrast and readability',
        category: 'professional',
      },
      {
        name: 'Navy Professional',
        foregroundColor: '#1E3A8A',
        backgroundColor: '#F8FAFC',
        description: 'Professional and trustworthy',
        category: 'professional',
      },
      {
        name: 'Forest Green',
        foregroundColor: '#065F46',
        backgroundColor: '#ECFDF5',
        description: 'Natural and calming',
        category: 'minimal',
      },
      {
        name: 'Deep Purple',
        foregroundColor: '#581C87',
        backgroundColor: '#FAF5FF',
        description: 'Creative and modern',
        category: 'creative',
      },
      {
        name: 'Crimson Bold',
        foregroundColor: '#DC2626',
        backgroundColor: '#FEF2F2',
        description: 'Bold and attention-grabbing',
        category: 'bold',
      },
      {
        name: 'Slate Minimal',
        foregroundColor: '#334155',
        backgroundColor: '#F1F5F9',
        description: 'Clean and minimal',
        category: 'minimal',
      },
    ];

    // Customize based on content type
    switch (contentType) {
      case 'store':
        return [
          ...baseColors.slice(0, 2),
          {
            name: 'Shopping Blue',
            foregroundColor: '#2563EB',
            backgroundColor: '#EFF6FF',
            description: 'Perfect for retail and e-commerce',
            category: 'brand',
          },
          {
            name: 'Gold Premium',
            foregroundColor: '#D97706',
            backgroundColor: '#FFFBEB',
            description: 'Luxury and premium feel',
            category: 'brand',
          },
          ...baseColors.slice(4),
        ];
      
      case 'playlist':
        return [
          ...baseColors.slice(0, 1),
          {
            name: 'Music Purple',
            foregroundColor: '#7C3AED',
            backgroundColor: '#F5F3FF',
            description: 'Creative and artistic',
            category: 'creative',
          },
          {
            name: 'Sound Wave',
            foregroundColor: '#059669',
            backgroundColor: '#ECFDF5',
            description: 'Audio and music themed',
            category: 'creative',
          },
          ...baseColors.slice(3),
        ];
      
      default:
        return baseColors;
    }
  }

  // Utility method to get color suggestions based on brand colors
  async getColorHarmony(baseColor: string): Promise<string[]> {
    // Generate complementary, triadic, and analogous colors
    const hsl = this.hexToHsl(baseColor);
    if (!hsl) return [baseColor];

    const [h, s, l] = hsl;
    
    return [
      baseColor, // Original
      this.hslToHex((h + 180) % 360, s, l), // Complementary
      this.hslToHex((h + 120) % 360, s, l), // Triadic 1
      this.hslToHex((h + 240) % 360, s, l), // Triadic 2
      this.hslToHex((h + 30) % 360, s, l),  // Analogous 1
      this.hslToHex((h - 30 + 360) % 360, s, l), // Analogous 2
    ];
  }

  private hexToHsl(hex: string): [number, number, number] | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    let l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [h * 360, s * 100, l * 100];
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
  }
}

export const aiColorService = new AIColorService();
export type { ColorPalette, ColorSuggestionRequest }; 