package lk.privatebus.drivergps
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GpsTrackingService:Service(){
 private val client=OkHttpClient.Builder().callTimeout(20,TimeUnit.SECONDS).build()
 private lateinit var fused:FusedLocationProviderClient
 private var callback:LocationCallback?=null
 private var tripId="";private var token=""
 override fun onCreate(){super.onCreate();fused=LocationServices.getFusedLocationProviderClient(this);createChannel()}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  tripId=intent?.getStringExtra("trip_id")?:tripId;token=TokenStore.get(this)?:""
  if(tripId.isBlank()||token.isBlank()){stopSelf();return START_NOT_STICKY}
  val n=notification("Sharing live location for trip "+tripId)
  if(Build.VERSION.SDK_INT>=29)startForeground(2601,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)else startForeground(2601,n)
  beginUpdates();return START_STICKY
 }
 private fun beginUpdates(){
  val request=LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000L).setMinUpdateIntervalMillis(3000L).setMinUpdateDistanceMeters(10f).build()
  callback=object:LocationCallback(){override fun onLocationResult(result:LocationResult){result.lastLocation?.let{loc->upload(loc.latitude,loc.longitude,loc.accuracy.toDouble(),if(loc.hasSpeed())loc.speed.toDouble()else null,if(loc.hasBearing())loc.bearing.toDouble()else null)}}}
  try{fused.requestLocationUpdates(request,callback!!,Looper.getMainLooper())}catch(_:SecurityException){stopSelf()}
 }
 private fun upload(lat:Double,lon:Double,accuracy:Double,speed:Double?,heading:Double?){
  Thread{try{
   val p=JSONObject().put("latitude",lat).put("longitude",lon).put("accuracy",accuracy);if(speed!=null)p.put("speed",speed);if(heading!=null)p.put("heading",heading)
   val req=Request.Builder().url(BuildConfig.APP_BASE_URL.trimEnd('/')+"/api/tracking/"+tripId+"/location").addHeader("Authorization","Bearer "+token).post(p.toString().toRequestBody("application/json".toMediaType())).build()
   client.newCall(req).execute().use{res->if(!res.isSuccessful)updateNotice("GPS upload issue ("+res.code+"). Check connection or assignment.")}
  }catch(_:Exception){updateNotice("GPS offline. Waiting for mobile data.")}}.start()
 }
 private fun createChannel(){if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("private_bus_live_gps","Bus GPS tracking",NotificationManager.IMPORTANCE_LOW))}
 private fun notification(message:String):Notification=NotificationCompat.Builder(this,"private_bus_live_gps").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Private Bus GPS is active").setContentText(message).setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build()
 private fun updateNotice(message:String){getSystemService(NotificationManager::class.java).notify(2601,notification(message))}
 override fun onDestroy(){callback?.let{fused.removeLocationUpdates(it)};super.onDestroy()}
 override fun onBind(intent:Intent?):IBinder?=null
}