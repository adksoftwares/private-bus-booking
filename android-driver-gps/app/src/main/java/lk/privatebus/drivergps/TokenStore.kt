package lk.privatebus.drivergps
import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
object TokenStore {
 private const val PREFS="driver_secure_session"
 private const val QUEUE="pending_gps_points"
 private fun prefs(context:Context)=EncryptedSharedPreferences.create(context,PREFS,MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
 fun save(context:Context,access:String,refresh:String?=null){val e=prefs(context).edit().putString("access_token",access);if(!refresh.isNullOrBlank())e.putString("refresh_token",refresh);e.apply()}
 fun get(context:Context):String?=prefs(context).getString("access_token",null)
 fun getRefresh(context:Context):String?=prefs(context).getString("refresh_token",null)
 @Synchronized fun enqueue(context:Context,tripId:String,point:JSONObject){val p=prefs(context);val a=try{JSONArray(p.getString(QUEUE,"[]"))}catch(_:Exception){JSONArray()};if(a.length()>=5000)return;a.put(JSONObject().put("trip_id",tripId).put("point",point));p.edit().putString(QUEUE,a.toString()).apply()}
 @Synchronized fun peek(context:Context):JSONObject?{val a=try{JSONArray(prefs(context).getString(QUEUE,"[]"))}catch(_:Exception){JSONArray()};return if(a.length()>0)a.optJSONObject(0)else null}
 @Synchronized fun removeFirst(context:Context){val p=prefs(context);val old=try{JSONArray(p.getString(QUEUE,"[]"))}catch(_:Exception){JSONArray()};val next=JSONArray();for(i in 1 until old.length())next.put(old.opt(i));p.edit().putString(QUEUE,next.toString()).apply()}
 fun pendingCount(context:Context):Int=try{JSONArray(prefs(context).getString(QUEUE,"[]")).length()}catch(_:Exception){0}
 fun clear(context:Context){prefs(context).edit().remove("access_token").remove("refresh_token").apply()}
}