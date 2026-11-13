package lk.privatebus.drivergps
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.net.Uri
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class GpsTrackingService:Service(){
 private val client=OkHttpClient.Builder().callTimeout(20,TimeUnit.SECONDS).build()
 private val executor=Executors.newSingleThreadExecutor()
 private val flushing=AtomicBoolean(false)
 private lateinit var fused:FusedLocationProviderClient
 private var callback:LocationCallback?=null
 private var tripId=""
 private var token=""
 override fun onCreate(){super.onCreate();fused=LocationServices.getFusedLocationProviderClient(this);createChannel()}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  tripId=intent?.getStringExtra("trip_id")?:tripId
  token=TokenStore.get(this)?:""
  if(tripId.isBlank()||token.isBlank()){stopSelf();return START_NOT_STICKY}
  val n=notification("Sharing live location for trip "+tripId)
  if(Build.VERSION.SDK_INT>=29)startForeground(2601,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else startForeground(2601,n)
  beginUpdates()
  return START_STICKY
 }
 private fun beginUpdates(){
  val request=LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000L).setMinUpdateIntervalMillis(3000L).setMinUpdateDistanceMeters(10f).build()
  callback=object:LocationCallback(){override fun onLocationResult(result:LocationResult){result.lastLocation?.let{loc->
   val point=JSONObject().put("latitude",loc.latitude).put("longitude",loc.longitude).put("accuracy",loc.accuracy.toDouble()).put("recordedAt",Instant.ofEpochMilli(loc.time).toString())
   if(loc.hasSpeed())point.put("speed",loc.speed.toDouble())
   if(loc.hasBearing())point.put("heading",loc.bearing.toDouble())
   TokenStore.enqueue(this@GpsTrackingService,tripId,point)
   flushPending()
  }}}
  try{fused.requestLocationUpdates(request,callback!!,Looper.getMainLooper())}catch(_:SecurityException){stopSelf()}
 }
 private fun flushPending(){
  if(!flushing.compareAndSet(false,true))return
  executor.execute{
   try{
    while(true){
     val item=TokenStore.peek(this)?:break
     val queuedTrip=item.optString("trip_id")
     val point=item.optJSONObject("point")
     if(point==null){TokenStore.removeFirst(this);continue}
     var response=postPoint(queuedTrip,point,token)
     if(response==401){if(!refreshSession())break;token=TokenStore.get(this)?:"";response=postPoint(queuedTrip,point,token)}
     if(response !in 200..299){updateNotice("GPS upload waiting (HTTP "+response+"). Pending points: "+TokenStore.pendingCount(this));break}
     TokenStore.removeFirst(this)
    }
   }finally{flushing.set(false)}
  }
 }
 private fun postPoint(id:String,point:JSONObject,bearer:String):Int{
  val req=Request.Builder().url(BuildConfig.APP_BASE_URL.trimEnd('/')+"/api/tracking/"+Uri.encode(id)+"/location").addHeader("Authorization","Bearer "+bearer).post(point.toString().toRequestBody("application/json".toMediaType())).build()
  return client.newCall(req).execute().use{it.code}
 }
 private fun refreshSession():Boolean{
  val refresh=TokenStore.getRefresh(this)?:return false
  return try{
   val body=JSONObject().put("refresh_token",refresh).toString().toRequestBody("application/json".toMediaType())
   val req=Request.Builder().url(BuildConfig.SUPABASE_URL.trimEnd('/')+"/auth/v1/token?grant_type=refresh_token").addHeader("apikey",BuildConfig.SUPABASE_ANON_KEY).post(body).build()
   client.newCall(req).execute().use{res->
    if(!res.isSuccessful)return false
    val json=JSONObject(res.body?.string()?:return false)
    val access=json.optString("access_token")
    if(access.isBlank())return false
    TokenStore.save(this,access,json.optString("refresh_token",refresh))
    true
   }
  }catch(_:Exception){false}
 }
 private fun createChannel(){if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("private_bus_live_gps","Bus GPS tracking",NotificationManager.IMPORTANCE_LOW))}
 private fun notification(message:String):Notification=NotificationCompat.Builder(this,"private_bus_live_gps").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Private Bus GPS is active").setContentText(message).setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build()
 private fun updateNotice(message:String){getSystemService(NotificationManager::class.java).notify(2601,notification(message))}
 override fun onDestroy(){callback?.let{fused.removeLocationUpdates(it)};executor.shutdown();super.onDestroy()}
 override fun onBind(intent:Intent?):IBinder?=null
}