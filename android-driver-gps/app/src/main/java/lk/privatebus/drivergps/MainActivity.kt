package lk.privatebus.drivergps
import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.net.Uri
import android.view.ViewGroup
import android.widget.*
import androidx.core.content.ContextCompat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity:Activity(){
 private val client=OkHttpClient()
 private val executor=Executors.newSingleThreadExecutor()
 private lateinit var email:EditText
 private lateinit var password:EditText
 private lateinit var tripId:EditText
 private lateinit var status:TextView
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(36,48,36,32);layoutParams=ViewGroup.LayoutParams(-1,-1)}
  fun field(label:String,secret:Boolean=false)=EditText(this).apply{hint=label;textSize=16f;if(secret)inputType=129;root.addView(this,LinearLayout.LayoutParams(-1,58))}
  root.addView(TextView(this).apply{text="PRIVATE BUS DRIVER GPS";textSize=23f;setTextColor(0xFF111827.toInt())})
  root.addView(TextView(this).apply{text="Sign in with your existing Driver / Conductor account.";textSize=14f})
  email=field("Account email");password=field("Password",true);tripId=field("Assigned trip ID")
  val login=Button(this).apply{text="Sign in"};val start=Button(this).apply{text="Start trip GPS"};val finish=Button(this).apply{text="Finish trip"}
  status=TextView(this).apply{text="Sign in, enter your assigned trip ID, then start GPS.";textSize=14f}
  root.addView(login);root.addView(start);root.addView(finish);root.addView(status);setContentView(root)
  login.setOnClickListener{signIn()};start.setOnClickListener{checkPermissions()};finish.setOnClickListener{finishTrip()}
 }
 private fun signIn(){
  val mail=email.text.toString().trim();val pass=password.text.toString()
  if(mail.isBlank()||pass.isBlank()){status.text="Enter email and password.";return}
  status.text="Signing in…"
  executor.execute{try{
   val body=JSONObject().put("email",mail).put("password",pass).toString().toRequestBody("application/json".toMediaType())
   val req=Request.Builder().url(BuildConfig.SUPABASE_URL.trimEnd('/')+"/auth/v1/token?grant_type=password").addHeader("apikey",BuildConfig.SUPABASE_ANON_KEY).post(body).build()
   client.newCall(req).execute().use{res->val json=JSONObject(res.body?.string()?: "{}");if(!res.isSuccessful)throw IllegalStateException(json.optString("msg",json.optString("message","Sign in failed.")));val token=json.optString("access_token");if(token.isBlank())throw IllegalStateException("No access token returned.");TokenStore.save(this,token,json.optString("refresh_token"))}
   runOnUiThread{status.text="Signed in. Enter a trip assigned to this account."}
  }catch(e:Exception){runOnUiThread{status.text=e.message?:"Sign in failed."}}}
 }
 private fun checkPermissions(){
  val needed=mutableListOf<String>()
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
  if(android.os.Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.POST_NOTIFICATIONS)
  if(needed.isNotEmpty())requestPermissions(needed.toTypedArray(),41) else startTrip()
 }
 override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results);if (code == 41 && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startTrip() else status.text="Precise location permission is required."}
 private fun startTrip(){
  val token=TokenStore.get(this);val id=tripId.text.toString().trim()
  if(token.isNullOrBlank()){status.text="Please sign in first.";return};if(id.isBlank()){status.text="Enter your assigned trip ID.";return};if(!BuildConfig.APP_BASE_URL.startsWith("https://")){status.text="Set the production HTTPS APP_BASE_URL before building this app.";return}
  status.text="Starting trip GPS…"
  executor.execute{try{
   val body=JSONObject().put("action","start").toString().toRequestBody("application/json".toMediaType())
   val req=Request.Builder().url(BuildConfig.APP_BASE_URL.trimEnd('/')+"/api/tracking/"+Uri.encode(id)).addHeader("Authorization","Bearer "+token).post(body).build()
   client.newCall(req).execute().use{res->val json=JSONObject(res.body?.string()?: "{}");if(!res.isSuccessful)throw IllegalStateException(json.optString("error","Trip start rejected."))}
   runOnUiThread{ContextCompat.startForegroundService(this,Intent(this,GpsTrackingService::class.java).putExtra("trip_id",id));status.text="GPS service running. Keep its notification visible."}
  }catch(e:Exception){runOnUiThread{status.text=e.message?:"Unable to start tracking."}}}
 }
 private fun finishTrip(){
  val token=TokenStore.get(this);val id=tripId.text.toString().trim()
  if(token.isNullOrBlank()||id.isBlank()){status.text="Sign in and enter the trip ID first.";return}
  status.text="Finishing trip…"
  executor.execute{try{
   val body=JSONObject().put("action","stop").toString().toRequestBody("application/json".toMediaType())
   val req=Request.Builder().url(BuildConfig.APP_BASE_URL.trimEnd('/')+"/api/tracking/"+id).addHeader("Authorization","Bearer "+token).post(body).build()
   client.newCall(req).execute().use{res->val json=JSONObject(res.body?.string()?: "{}");if(!res.isSuccessful)throw IllegalStateException(json.optString("error","Unable to finish trip."))}
   runOnUiThread{stopService(Intent(this,GpsTrackingService::class.java));status.text="Trip completed. GPS stopped."}
  }catch(e:Exception){runOnUiThread{status.text=e.message?:"Unable to finish trip."}}}
 }
}