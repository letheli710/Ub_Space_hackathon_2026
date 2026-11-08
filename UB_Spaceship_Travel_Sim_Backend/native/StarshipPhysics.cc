// Native rigid-body propulsion, contact stress and detachable structural bonds.
// Gazebo/DART integrates all motion; this system never sets spacecraft velocity.
#include <gz/plugin/Register.hh>
#include <gz/sim/System.hh>
#include <gz/sim/Model.hh>
#include <gz/sim/Link.hh>
#include <gz/sim/Util.hh>
#include <gz/sim/SdfEntityCreator.hh>
#include <gz/sim/components/Collision.hh>
#include <gz/sim/components/ContactSensorData.hh>
#include <gz/sim/components/DetachableJoint.hh>
#include <gz/sim/components/Inertial.hh>
#include <gz/sim/components/JointPosition.hh>
#include <gz/sim/components/JointVelocity.hh>
#include <gz/sim/components/JointVelocityCmd.hh>
#include <gz/sim/components/JointForceCmd.hh>
#include <gz/sim/components/LinearVelocityCmd.hh>
#include <gz/sim/components/ParentEntity.hh>
#include <gz/sim/components/Name.hh>
#include <gz/transport/Node.hh>
#include <gz/msgs/stringmsg.pb.h>
#include <gz/msgs/double.pb.h>
#include <sdf/Root.hh>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <chrono>
#include <map>
#include <mutex>
#include <set>
#include <sstream>

namespace starship {
using namespace gz::sim;
using V = gz::math::Vector3d;
using J = nlohmann::json;
namespace C = gz::sim::components;
V vec(const J &j) { return {j.at(0).get<double>(), j.at(1).get<double>(), j.at(2).get<double>()}; }
J json(const V &v) { return {v.X(), v.Y(), v.Z()}; }
V capped(V v, double limit) { if (v.Length() > limit) v *= limit / v.Length(); return v; }
double seconds(const std::chrono::steady_clock::duration &d) { return std::chrono::duration<double>(d).count(); }

struct Bond {
  J spec;
  Entity joint, child;
  std::set<Entity> links;
  bool broken = false;
  double utilization = 0, shear = 0, normal = 0, bending = 0, brokenAt = -1;
};
struct Motor { J spec; Entity joint, child; double target = 0; };
struct Rock { std::string id; Entity model, link; V velocity; double radius, mass, born; bool initialized = false; };

class Physics : public System, public ISystemConfigure, public ISystemPreUpdate,
                public ISystemPostUpdate {
  Entity model = kNullEntity, hull = kNullEntity, world = kNullEntity, engine = kNullEntity;
  EventManager *events = nullptr;
  gz::transport::Node node;
  gz::transport::Node::Publisher publisher;
  J config, command = J::object(), telemetry;
  std::mutex mutex;
  std::chrono::steady_clock::time_point received;
  std::vector<J> impacts;
  std::map<std::string, double> targets;
  std::map<std::string, Entity> links;
  std::map<Entity, Entity> collisions;
  std::vector<Bond> bonds;
  std::vector<Motor> motors;
  std::vector<Rock> rocks;
  std::vector<std::string> seenImpacts;
  std::set<Entity> detached;
  double fuel = 0, lastPublish = -1, lastSim = -1, mass = 0;
  V force, torque, center;
  std::string mode = "coast", impactError;

  public: void Configure(const Entity &entity, const std::shared_ptr<const sdf::Element> &sdf,
      EntityComponentManager &ecm, EventManager &eventManager) override {
    model = entity; events = &eventManager; world = worldEntity(ecm);
    config = J::parse(sdf->Get<std::string>("configuration"));
    Model ship(model);
    for (const auto &name : config.at("links")) {
      Entity link = ship.LinkByName(ecm, name.get<std::string>());
      links[name] = link; Link(link).EnableVelocityChecks(ecm);
    }
    hull = links.at(config.at("hull_link")); engine = links.at(config.at("engine_link"));
    fuel = config.at("fuel_kg");
    for (auto spec : config.at("bonds")) {
      Bond b; b.spec = spec; b.joint = ship.JointByName(ecm, spec.at("joint_name"));
      b.child = links.at(spec.at("child_link"));
      for (const auto &name : spec.at("links")) b.links.insert(links.at(name));
      // Tag an existing fixed joint. Removing the JOINT ENTITY lets Physics's
      // EachRemoved<DetachableJoint> invoke DART without deleting child links.
      ecm.CreateComponent(b.joint, C::DetachableJoint({links.at(spec.at("parent_link")), b.child, "fixed"}));
      bonds.push_back(b);
    }
    ecm.Each<C::Collision, C::ParentEntity>([&](Entity e, const C::Collision *, const C::ParentEntity *p) {
      if (std::any_of(links.begin(), links.end(), [&](const auto &pair) { return pair.second == p->Data(); })) {
        collisions[e] = p->Data(); ecm.CreateComponent(e, C::ContactSensorData());
      } return true;
    });
    for (auto spec : config.at("motors")) {
      Motor m{spec, ship.JointByName(ecm, spec.at("joint_name")), links.at(spec.at("child_link")), 0};
      ecm.CreateComponent(m.joint, C::JointPosition()); ecm.CreateComponent(m.joint, C::JointVelocity());
      std::string topic = spec.at("topic");
      node.Subscribe<gz::msgs::Double>(topic, [this, topic](const gz::msgs::Double &msg) {
        if (std::isfinite(msg.data())) { std::lock_guard<std::mutex> lock(mutex); targets[topic] = msg.data(); }
      });
      motors.push_back(m);
    }
    node.Subscribe<gz::msgs::StringMsg>("/starship/physics/command", [this](const gz::msgs::StringMsg &msg) {
      try {
        auto value = J::parse(msg.data()); std::lock_guard<std::mutex> lock(mutex);
        command = value; received = std::chrono::steady_clock::now();
      } catch (const std::exception &) {} // Invalid transport input never grants authority.
    });
    node.Subscribe<gz::msgs::StringMsg>("/starship/physics/impact", [this](const gz::msgs::StringMsg &msg) {
      try { auto value = J::parse(msg.data()); std::lock_guard<std::mutex> lock(mutex);
        if (impacts.size() < 8) impacts.push_back(value);
      } catch (const std::exception &) {}
    });
    publisher = node.Advertise<gz::msgs::StringMsg>("/starship/physics/state");
  }

  void spawn(const J &request, double now, EntityComponentManager &ecm) {
    const auto id = request.at("id").get<std::string>();
    if (std::find(seenImpacts.begin(), seenImpacts.end(), id) != seenImpacts.end()) return;
    if (id.size() > 80 || id.empty() || id.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789_") != std::string::npos)
      throw std::runtime_error("Invalid projectile ID");
    const auto target = request.at("target_id").get<std::string>();
    auto it = std::find_if(config["impact_targets"].begin(), config["impact_targets"].end(),
                          [&](const J &t) { return t["id"] == target; });
    if (it == config["impact_targets"].end() || rocks.size() >= 24) throw std::runtime_error("Unknown target or 24-rock limit reached");
    Entity targetLink = links.at(it->at("link_name"));
    if (detached.count(targetLink)) throw std::runtime_error("Target is already detached");
    double r = request.at("radius_m"), m = request.at("mass_kg"), speed = request.at("speed_m_s");
    if (!(r >= .15 && r <= 2 && m >= 1 && m <= 5000 && speed >= 1 && speed <= 150)) throw std::runtime_error("Impact outside physical resolution limits");
    auto pose = worldPose(targetLink, ecm);
    V aim = pose.Pos() + pose.Rot().RotateVector(vec(it->at("point_local_m")));
    V direction = worldPose(hull, ecm).Rot().RotateVector(vec(request.at("direction_body"))).Normalized();
    if (direction.Length() < .9) throw std::runtime_error("Invalid impact direction");
    // Launch from nearby with the target's instantaneous point velocity added.
    // It is a ballistic projectile, not a homing object after creation.
    V velocity = Link(targetLink).WorldLinearVelocity(ecm).value_or(V::Zero) + direction * speed;
    V position = aim - direction * (r + 12.);
    double inertia = .4 * m * r * r;
    std::ostringstream xml;
    xml << "<sdf version='1.9'><model name='" << id << "'><pose>" << position << " 0 0 0</pose><link name='rock'>"
        << "<inertial><mass>" << m << "</mass><inertia><ixx>" << inertia << "</ixx><iyy>" << inertia << "</iyy><izz>" << inertia << "</izz></inertia></inertial>"
        << "<collision name='surface'><geometry><sphere><radius>" << r << "</radius></sphere></geometry><surface><bounce><restitution_coefficient>0.15</restitution_coefficient></bounce><friction><ode><mu>0.5</mu><mu2>0.5</mu2></ode></friction></surface></collision>"
        << "<visual name='rock'><geometry><sphere><radius>" << r << "</radius></sphere></geometry></visual></link></model></sdf>";
    sdf::Root document;
    auto errors = document.LoadSdfString(xml.str());
    if (!errors.empty() || !document.Model()) throw std::runtime_error("Could not construct projectile SDF");
    SdfEntityCreator creator(ecm, *events);
    Entity rockModel = creator.CreateEntities(document.Model()); creator.SetParent(rockModel, world);
    Entity link = Model(rockModel).LinkByName(ecm, "rock"); Link(link).EnableVelocityChecks(ecm);
    rocks.push_back({id, rockModel, link, velocity, r, m, now, false});
    seenImpacts.push_back(id);
    if (seenImpacts.size() > 256) seenImpacts.erase(seenImpacts.begin());
  }

  public: void PreUpdate(const UpdateInfo &info, EntityComponentManager &ecm) override {
    if (info.paused) return;
    double now = seconds(info.simTime), dt = seconds(info.dt);
    if (dt <= 0) return;
    J cmd; std::vector<J> queue; bool fresh;
    { std::lock_guard<std::mutex> lock(mutex); cmd = command; queue.swap(impacts);
      fresh = seconds(std::chrono::steady_clock::now() - received) < .6;
      for (auto &m : motors) if (targets.count(m.spec["topic"])) m.target = targets[m.spec["topic"]]; }
    for (auto &b : bonds) if (!b.broken && b.utilization >= 1) {
      b.broken = true; b.brokenAt = now;
      ecm.RequestRemoveEntity(b.joint);
      detached.insert(b.links.begin(), b.links.end());
    }
    for (auto &m : motors) {
      if (detached.count(m.child)) {
        ecm.RemoveComponent<C::JointVelocityCmd>(m.joint); ecm.RemoveComponent<C::JointForceCmd>(m.joint); continue;
      }
      auto q = ecm.Component<C::JointPosition>(m.joint);
      if (!q || q->Data().empty()) continue;
      double error = std::clamp(m.target, m.spec["lower"].get<double>(), m.spec["upper"].get<double>()) - q->Data()[0];
      if (m.spec["velocity_control"]) {
        double speed = m.spec["limit"];
        ecm.SetComponentData<C::JointVelocityCmd>(m.joint, {std::clamp(error * 8., -speed, speed)});
      } else {
        auto v = ecm.Component<C::JointVelocity>(m.joint);
        double torque = error * 120 - (v && !v->Data().empty() ? v->Data()[0] * 180 : 0);
        ecm.SetComponentData<C::JointForceCmd>(m.joint, {std::clamp(torque, -400., 400.)});
      }
    }
    for (const auto &request : queue) { try { spawn(request, now, ecm); impactError.clear(); }
      catch (const std::exception &e) { impactError = e.what(); } }
    for (auto &rock : rocks) {
      if (!rock.initialized && now > rock.born) {
        Link(rock.link).SetLinearVelocity(ecm, rock.velocity); rock.initialized = true;
      } else if (rock.initialized) {
        // Gazebo resets persistent velocity-command components to zero each step.
        // Remove the one-shot launch command so subsequent motion is ballistic.
        ecm.RemoveComponent<C::LinearVelocityCmd>(rock.link);
      }
    }
    for (auto it = rocks.begin(); it != rocks.end();) {
      if (now - it->born > 120) { ecm.RequestRemoveEntity(it->model); it = rocks.erase(it); } else ++it;
    }
    mass = 0; center = V::Zero;
    for (const auto &[name, id] : links) if (!detached.count(id)) {
      auto inertial = ecm.Component<C::Inertial>(id);
      double m = inertial->Data().MassMatrix().Mass();
      mass += m; center += Link(id).WorldInertialPose(ecm)->Pos() * m;
    }
    center /= mass;
    force = torque = V::Zero; mode = "coast";
    auto pose = worldPose(hull, ecm); auto q = pose.Rot();
    V velocity = Link(hull).WorldLinearVelocity(ecm).value_or(V::Zero);
    V omega = Link(hull).WorldAngularVelocity(ecm).value_or(V::Zero);
    try {
      if (fresh && fuel > 0 && now <= cmd.value("valid_until_sim_s", -1.) && now >= lastSim) {
        double power = std::clamp(cmd.value("power", 0.), 0., 1.);
        double mainLimit = config["main_thrust_n"].get<double>() * power * !detached.count(engine);
        double rcsLimit = config["rcs_thrust_n"].get<double>() * power;
        double torqueLimit = config["rcs_torque_nm"].get<double>() * power;
        V desiredForce, desiredTorque;
        mode = cmd.value("mode", "coast");
        if (mode == "velocity") {
          V target = capped(vec(cmd.at("velocity_world_m_s")), config["cruise_speed_m_s"]);
          desiredForce = q.RotateVectorReverse((target - velocity) * (mass / 4.));
          // Turn the nose toward travel, preserving momentum while attitude changes.
          V direction = target.Length() > .2 ? target.Normalized() : q.RotateVector(V::UnitX);
          V forward = q.RotateVector(V::UnitX), error = forward.Cross(direction);
          if (forward.Dot(direction) < -.98) error = q.RotateVector(V::UnitZ);
          desiredTorque = q.RotateVectorReverse(error * (mass * 8.) - omega * (mass * 35.));
        } else if (mode == "burn") {
          desiredForce = capped(vec(cmd.at("linear_throttle")), 1) * rcsLimit;
          if (desiredForce.X() > 0) desiredForce.X(vec(cmd.at("linear_throttle")).X() * (mainLimit > 0 ? mainLimit : rcsLimit));
          desiredTorque = capped(vec(cmd.at("angular_throttle")), 1) * torqueLimit;
        }
        if (mode == "velocity" || mode == "burn") {
          double main = std::clamp(desiredForce.X(), 0., mainLimit);
          V rcs = capped(desiredForce - V(main, 0, 0), rcsLimit);
          V mainWorld = q.RotateVector(V(main, 0, 0)), rcsWorld = q.RotateVector(rcs);
          V mainCenter = Link(engine).WorldInertialPose(ecm)->Pos();
          V rootCenter = Link(hull).WorldInertialPose(ecm)->Pos();
          V correction = (mainCenter-center).Cross(mainWorld) + (rootCenter-center).Cross(rcsWorld);
          V attitude = capped(q.RotateVector(desiredTorque) - correction, torqueLimit);
          double flow = main / (config["main_isp_s"].get<double>() * 9.80665)
                      + (rcs.Length() + attitude.Length() / config["rcs_lever_m"].get<double>()) / (config["rcs_isp_s"].get<double>() * 9.80665);
          double fraction = flow * dt > fuel ? fuel / (flow * dt) : 1.;
          fuel = std::max(0., fuel - flow * dt);
          if (main > 0) Link(engine).AddWorldForce(ecm, mainWorld * fraction);
          Link(hull).AddWorldWrench(ecm, rcsWorld * fraction, attitude * fraction);
          force = (mainWorld+rcsWorld) * fraction; torque = (attitude+correction) * fraction;
        }
      }
    } catch (const std::exception &) { mode = "coast"; }
    lastSim = now;
  }

  public: void PostUpdate(const UpdateInfo &info, const EntityComponentManager &ecm) override {
    if (info.paused) return;
    double now = seconds(info.simTime);
    std::vector<V> forces(bonds.size()), moments(bonds.size());
    for (const auto &[collision, link] : collisions) {
      auto data = ecm.Component<C::ContactSensorData>(collision);
      if (!data) continue;
      for (const auto &contact : data->Data().contact()) {
        // Each ship collision contributes once, only against an external body.
        if (contact.collision1().id() != collision || collisions.count(contact.collision2().id())) continue;
        for (int i = 0; i < contact.wrench_size() && i < contact.position_size(); ++i) {
          const auto &f = contact.wrench(i).body_1_wrench().force();
          const auto &p = contact.position(i);
          V force(f.x(), f.y(), f.z()), point(p.x(), p.y(), p.z());
          for (size_t b = 0; b < bonds.size(); ++b) if (!bonds[b].broken && bonds[b].links.count(link)) {
            forces[b] += force; moments[b] += (point-worldPose(bonds[b].child, ecm).Pos()).Cross(force);
          }
        }
      }
    }
    for (size_t i = 0; i < bonds.size(); ++i) {
      auto &b = bonds[i]; if (b.broken) continue;
      V normal = worldPose(b.child, ecm).Rot().RotateVector(vec(b.spec["normal_local"]));
      double axial = forces[i].Dot(normal);
      double shear = (forces[i] - normal * axial).Length() / b.spec["area_m2"].get<double>();
      double stress = std::abs(axial) / b.spec["area_m2"].get<double>();
      double bending = moments[i].Length() / b.spec["section_modulus_m3"].get<double>();
      double utilization = std::hypot(shear / b.spec["shear_strength_pa"].get<double>(),
                                     (stress+bending) / b.spec["normal_strength_pa"].get<double>());
      if (utilization > b.utilization) { b.utilization = utilization; b.shear = shear; b.normal = stress; b.bending = bending; }
    }
    if (now - lastPublish < .05) return;
    lastPublish = now;
    auto hullBody = Link(hull);
    V momentum = V::Zero;
    for (const auto &[name, id] : links) {
      const auto &inertia = ecm.Component<C::Inertial>(id)->Data();
      V offset = worldPose(id, ecm).Rot().RotateVector(inertia.Pose().Pos());
      V velocity = Link(id).WorldLinearVelocity(ecm).value_or(V::Zero)
                 + Link(id).WorldAngularVelocity(ecm).value_or(V::Zero).Cross(offset);
      momentum += velocity * inertia.MassMatrix().Mass();
    }
    for (const auto &rock : rocks) momentum += Link(rock.link).WorldLinearVelocity(ecm).value_or(V::Zero) * rock.mass;
    J state = {{"sim_time_s", now}, {"mode", mode}, {"fuel_kg", fuel}, {"initial_fuel_kg", config["fuel_kg"]},
       {"attached_mass_kg", mass}, {"total_system_momentum_kg_m_s", json(momentum)}, {"velocity_world_m_s", json(hullBody.WorldLinearVelocity(ecm).value_or(V::Zero))},
       {"angular_velocity_world_rad_s", json(hullBody.WorldAngularVelocity(ecm).value_or(V::Zero))},
       {"force_world_n", json(force)}, {"torque_world_nm", json(torque)}, {"bonds", J::array()},
       {"detached_links", J::array()}, {"debris", J::array()}, {"joints", J::object()}, {"projectiles", J::array()}, {"impact_error", impactError}};
    for (const auto &motor : motors) {
      auto measured = ecm.Component<C::JointPosition>(motor.joint);
      if (measured && !measured->Data().empty()) state["joints"][motor.spec["joint_name"].get<std::string>()] = measured->Data()[0];
    }
    for (const auto &[name, id] : links) if (detached.count(id)) {
      state["detached_links"].push_back(name);
      auto pose = worldPose(id, ecm);
      state["debris"].push_back({{"link_name", name}, {"position", json(pose.Pos())},
        {"orientation", {pose.Rot().X(), pose.Rot().Y(), pose.Rot().Z(), pose.Rot().W()}},
        {"velocity_world_m_s", json(Link(id).WorldLinearVelocity(ecm).value_or(V::Zero))}});
    }
    for (const auto &b : bonds) state["bonds"].push_back({{"id", b.spec["id"]}, {"broken", b.broken},
       {"broken_at_sim_time_s", b.brokenAt}, {"peak_utilization", b.utilization},
       {"peak_shear_stress_pa", b.shear}, {"normal_stress_pa", b.normal}, {"bending_stress_pa", b.bending}});
    for (const auto &rock : rocks) {
      auto pose = worldPose(rock.link, ecm);
      state["projectiles"].push_back({{"id", rock.id}, {"radius_m", rock.radius}, {"mass_kg", rock.mass},
        {"position", json(pose.Pos())}, {"velocity_world_m_s", json(Link(rock.link).WorldLinearVelocity(ecm).value_or(V::Zero))}});
    }
    gz::msgs::StringMsg message; message.set_data(state.dump()); publisher.Publish(message);
  }
};
}
GZ_ADD_PLUGIN(starship::Physics, gz::sim::System, starship::Physics::ISystemConfigure,
              starship::Physics::ISystemPreUpdate, starship::Physics::ISystemPostUpdate)
