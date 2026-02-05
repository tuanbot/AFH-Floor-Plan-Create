
import { GoogleGenAI, Type } from "@google/genai";
import { Room, ExitPoint, HouseDetails } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeSafetyPlan = async (rooms: Room[], exits: ExitPoint[], details: HouseDetails) => {
  const prompt = `
    As a fire safety expert for Adult Family Homes (AFH), analyze this floor plan:
    
    House Details: ${JSON.stringify(details)}
    Rooms: ${rooms.map(r => `${r.name} (${r.width}ft x ${r.height}ft)`).join(', ')}
    Safety Equipment/Exits: ${exits.map(e => `${e.type}: ${e.label}`).join(', ')}

    Please provide:
    1. A safety score (1-100).
    2. Missing essential safety items (e.g., extinguishers near kitchen, smoke detectors, primary/secondary exits for bedrooms).
    3. Evaluation of exit accessibility for elderly or disabled residents.
    4. General recommendations for improvement.
    
    Format the response clearly with sections.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Failed to analyze the plan. Please check your safety equipment manually.";
  }
};

export const convertSketchToDiagram = async (base64Image: string): Promise<Partial<Room>[]> => {
  const prompt = `
    Analyze this hand-drawn floor plan sketch. 
    Identify all rooms and areas. 
    Estimate their names (e.g., Kitchen, Master Bedroom, Hallway, Garden, Balcony).
    Estimate their dimensions in feet (10-20ft range typically).
    Provide coordinates (x, y) and dimensions (width, height) relative to an 800x800 canvas.
    Assume the sketch covers the majority of the canvas.
    Return only the room layout as JSON.
  `;

  try {
    // Fix: Using correct object structure for contents with parts
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image.split(',')[1] || base64Image,
            },
          },
          { text: prompt },
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              color: { type: Type.STRING, description: "A light hex color for the room, e.g., #f1f5f9" },
            },
            required: ["name", "x", "y", "width", "height"],
          },
        },
      },
    });

    const jsonStr = response.text;
    if (jsonStr) {
      return JSON.parse(jsonStr);
    }
    return [];
  } catch (error) {
    console.error("Sketch conversion error:", error);
    return [];
  }
};
