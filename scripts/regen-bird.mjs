// Regenerate the 참새 sky object as a small flock of distant bird silhouettes
// (natural in flight, no frozen-wing single frame).
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { generateObjectSpriteBytes, uploadObjectSprite } from "../src/lib/dynamic-object-gen.ts";
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL,SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY,OPENAI=process.env.OPENAI_API_KEY;
const sb=createClient(URL,SERVICE,{auth:{persistSession:false}});
const VARIANT="2c576990-b3d3-4ce4-83ef-84b4f9ded7a1", TYPE="cur_d792a7226b18b884";
const desc="a small loose flock of five tiny distant birds in flight, very simple minimal dark silhouettes (soft m-shapes), all gliding to the right, scattered, no fine feather detail, like faraway birds high in the sky";
async function fit(png){for(const colors of [256,128,96]){const o=await sharp(png).png({palette:true,colors,compressionLevel:9,effort:9}).toBuffer();if(o.length<=2_000_000)return o;}return sharp(png).png({palette:true,colors:64}).toBuffer();}
const raw=await generateObjectSpriteBytes(desc,OPENAI,"sky");
if(!raw){console.error("gen failed");process.exit(1);}
const url=await uploadObjectSprite(sb,await fit(raw),"curated");
if(!url){console.error("upload failed");process.exit(1);}
await sb.from("object_variants").update({sprite_url:url}).eq("id",VARIANT);
await sb.from("object_types").update({gen_description:desc}).eq("type_key",TYPE);
console.log("bird regenerated:",url);
